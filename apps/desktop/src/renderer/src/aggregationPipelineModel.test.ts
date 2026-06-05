import { describe, expect, it } from "vitest";
import {
  addAggregationPipelineStage,
  aggregationPipelineStageTypes,
  buildRawPipelineFromAggregationModel,
  createAggregationPipelineStage,
  createDefaultAggregationPipelineModel,
  moveAggregationPipelineStage,
  removeAggregationPipelineStage,
  reorderAggregationPipelineStage,
  setAggregationPipelineStageEnabled,
  updateAggregationPipelineStage,
  validateRawAggregationPipeline,
} from "./aggregationPipelineModel";

describe("aggregationPipelineModel", () => {
  it("creates an empty pipeline model and exposes MVP stage types", () => {
    expect(createDefaultAggregationPipelineModel()).toEqual({ stages: [] });
    expect(aggregationPipelineStageTypes).toEqual([
      "match",
      "project",
      "sort",
      "limit",
      "skip",
      "count",
      "group",
      "unwind",
    ]);
  });

  it("adds, updates, disables, and removes stages immutably", () => {
    const model = createDefaultAggregationPipelineModel();
    const matchStage = createAggregationPipelineStage("match", {
      filter: { status: "active" },
      id: "match_status",
    });
    const withStage = addAggregationPipelineStage(model, matchStage);
    const updated = updateAggregationPipelineStage(withStage, "match_status", {
      filter: { status: "pending" },
    });
    const disabled = setAggregationPipelineStageEnabled(
      updated,
      "match_status",
      false,
    );
    const removed = removeAggregationPipelineStage(updated, "match_status");

    expect(model.stages).toHaveLength(0);
    expect(withStage.stages).toHaveLength(1);
    expect(buildRawPipelineFromAggregationModel(updated)).toEqual([
      { $match: { status: "pending" } },
    ]);
    expect(buildRawPipelineFromAggregationModel(disabled)).toEqual([]);
    expect(removed.stages).toHaveLength(0);
  });

  it("reorders stages by index and direction", () => {
    const model = {
      stages: [
        createAggregationPipelineStage("match", { id: "match" }),
        createAggregationPipelineStage("sort", {
          id: "sort",
          sort: { createdAt: -1 },
        }),
        createAggregationPipelineStage("limit", { id: "limit", limit: 20 }),
      ],
    };

    expect(
      reorderAggregationPipelineStage(model, 2, 0).stages.map(
        (stage) => stage.id,
      ),
    ).toEqual(["limit", "match", "sort"]);
    expect(
      moveAggregationPipelineStage(model, "sort", "up").stages.map(
        (stage) => stage.id,
      ),
    ).toEqual(["sort", "match", "limit"]);
    expect(moveAggregationPipelineStage(model, "missing", "up")).toBe(model);
  });

  it("builds a raw MongoDB pipeline from enabled complete stages", () => {
    const model = {
      stages: [
        createAggregationPipelineStage("match", {
          filter: { status: "active" },
        }),
        createAggregationPipelineStage("project", {
          projection: { email: 1, status: 1 },
        }),
        createAggregationPipelineStage("sort", {
          sort: { createdAt: -1 },
        }),
        createAggregationPipelineStage("skip", { skip: 10 }),
        createAggregationPipelineStage("limit", { limit: 25 }),
        createAggregationPipelineStage("count", { field: "total" }),
      ],
    };

    expect(buildRawPipelineFromAggregationModel(model)).toEqual([
      { $match: { status: "active" } },
      { $project: { email: 1, status: 1 } },
      { $sort: { createdAt: -1 } },
      { $skip: 10 },
      { $limit: 25 },
      { $count: "total" },
    ]);
  });

  it("builds group and unwind stages", () => {
    const model = {
      stages: [
        createAggregationPipelineStage("unwind", {
          path: "items",
          preserveNullAndEmptyArrays: true,
        }),
        createAggregationPipelineStage("group", {
          accumulators: { total: { $sum: "$items.price" } },
          idExpression: "$status",
        }),
      ],
    };

    expect(buildRawPipelineFromAggregationModel(model)).toEqual([
      {
        $unwind: {
          path: "$items",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$status",
          total: { $sum: "$items.price" },
        },
      },
    ]);
  });

  it("skips incomplete optional stages when generating raw pipeline", () => {
    const model = {
      stages: [
        createAggregationPipelineStage("sort"),
        createAggregationPipelineStage("skip", { skip: 0 }),
        createAggregationPipelineStage("limit", { limit: 0 }),
        createAggregationPipelineStage("count", { field: "" }),
        createAggregationPipelineStage("unwind", { path: "" }),
      ],
    };

    expect(buildRawPipelineFromAggregationModel(model)).toEqual([]);
  });

  it("validates raw stage structure and blocks dangerous stages", () => {
    expect(() =>
      validateRawAggregationPipeline([{ $match: {}, $out: "archive" }]),
    ).toThrow("Each aggregation stage must contain exactly one operator");
    expect(() =>
      validateRawAggregationPipeline([{ $merge: "archive" }]),
    ).toThrow("Blocked aggregation stage: $merge");
    expect(() =>
      validateRawAggregationPipeline([{ $search: { text: "hotel" } }]),
    ).toThrow("Unsupported aggregation stage in MVP: $search");
  });
});
