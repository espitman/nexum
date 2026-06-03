import { describe, expect, it } from "vitest";
import {
  addQueryBuilderNode,
  buildMongoFilterFromQueryBuilder,
  createDefaultQueryBuilderModel,
  createQueryBuilderCondition,
  createQueryBuilderGroup,
  queryBuilderConditionOperators,
  removeQueryBuilderNode,
  updateQueryBuilderCondition,
  updateQueryBuilderGroup,
} from "./queryBuilderModel";

describe("queryBuilderModel", () => {
  it("creates a root AND group with an empty condition", () => {
    const model = createDefaultQueryBuilderModel();

    expect(model).toMatchObject({
      combinator: "and",
      enabled: true,
      id: "root",
      kind: "group",
    });
    expect(model.children).toHaveLength(1);
    expect(model.children[0]).toMatchObject({
      enabled: true,
      field: "",
      kind: "condition",
      operator: "equals",
    });
  });

  it("adds, updates, and removes nodes immutably", () => {
    const model = createQueryBuilderGroup({ id: "root" });
    const condition = createQueryBuilderCondition({
      field: "status",
      id: "condition_status",
      value: "active",
    });
    const withCondition = addQueryBuilderNode(model, "root", condition);
    const updated = updateQueryBuilderCondition(
      withCondition,
      "condition_status",
      {
        value: "pending",
      },
    );
    const removed = removeQueryBuilderNode(updated, "condition_status");

    expect(model.children).toHaveLength(0);
    expect(withCondition.children).toHaveLength(1);
    expect(buildMongoFilterFromQueryBuilder(updated)).toEqual({
      status: "pending",
    });
    expect(removed.children).toHaveLength(0);
  });

  it("supports AND and OR combinators when building MongoDB filters", () => {
    const root = createQueryBuilderGroup({
      children: [
        createQueryBuilderCondition({
          field: "status",
          id: "condition_status",
          value: "active",
        }),
        createQueryBuilderGroup({
          children: [
            createQueryBuilderCondition({
              field: "role",
              id: "condition_role_admin",
              value: "admin",
            }),
            createQueryBuilderCondition({
              field: "role",
              id: "condition_role_owner",
              value: "owner",
            }),
          ],
          combinator: "or",
          id: "group_role",
        }),
      ],
      id: "root",
    });

    expect(buildMongoFilterFromQueryBuilder(root)).toEqual({
      $and: [
        { status: "active" },
        {
          $or: [{ role: "admin" }, { role: "owner" }],
        },
      ],
    });
  });

  it("updates group combinators and ignores disabled or incomplete nodes", () => {
    const root = createQueryBuilderGroup({
      children: [
        createQueryBuilderCondition({
          enabled: false,
          field: "status",
          id: "condition_disabled",
          value: "active",
        }),
        createQueryBuilderCondition({
          field: "",
          id: "condition_empty",
          value: "ignored",
        }),
        createQueryBuilderCondition({
          field: "profile.age",
          id: "condition_age",
          value: 30,
        }),
        createQueryBuilderCondition({
          field: "verified",
          id: "condition_verified",
          value: true,
        }),
      ],
      id: "root",
    });
    const updated = updateQueryBuilderGroup(root, "root", {
      combinator: "or",
    });

    expect(buildMongoFilterFromQueryBuilder(updated)).toEqual({
      $or: [{ "profile.age": 30 }, { verified: true }],
    });
  });

  it("exposes every supported condition operator", () => {
    expect(queryBuilderConditionOperators).toEqual([
      "equals",
      "notEquals",
      "greaterThan",
      "greaterThanOrEqual",
      "lessThan",
      "lessThanOrEqual",
      "contains",
      "exists",
      "in",
      "notIn",
      "regex",
    ]);
  });

  it.each([
    {
      expectedFilter: { status: "active" },
      operator: "equals",
      value: "active",
    },
    {
      expectedFilter: { status: { $ne: "deleted" } },
      operator: "notEquals",
      value: "deleted",
    },
    {
      expectedFilter: { age: { $gt: 18 } },
      field: "age",
      operator: "greaterThan",
      value: 18,
    },
    {
      expectedFilter: { age: { $gte: 18 } },
      field: "age",
      operator: "greaterThanOrEqual",
      value: 18,
    },
    {
      expectedFilter: { age: { $lt: 65 } },
      field: "age",
      operator: "lessThan",
      value: 65,
    },
    {
      expectedFilter: { age: { $lte: 65 } },
      field: "age",
      operator: "lessThanOrEqual",
      value: 65,
    },
    {
      expectedFilter: { title: { $options: "i", $regex: "hotel\\.com" } },
      field: "title",
      operator: "contains",
      value: "hotel.com",
    },
    {
      expectedFilter: { deletedAt: { $exists: true } },
      field: "deletedAt",
      operator: "exists",
      value: true,
    },
    {
      expectedFilter: { deletedAt: { $exists: false } },
      field: "deletedAt",
      operator: "exists",
      value: false,
    },
    {
      expectedFilter: { status: { $in: ["active", "pending"] } },
      operator: "in",
      value: ["active", "pending"],
    },
    {
      expectedFilter: { status: { $in: ["active"] } },
      operator: "in",
      value: "active",
    },
    {
      expectedFilter: { status: { $nin: ["deleted", "archived"] } },
      operator: "notIn",
      value: ["deleted", "archived"],
    },
    {
      expectedFilter: { email: { $regex: ".*@example\\.com$" } },
      field: "email",
      operator: "regex",
      value: ".*@example\\.com$",
    },
  ] as const)(
    "builds MongoDB filters for $operator",
    ({ expectedFilter, field = "status", operator, value }) => {
      const root = createQueryBuilderGroup({
        children: [
          createQueryBuilderCondition({
            field,
            operator,
            value,
          }),
        ],
        id: "root",
      });

      expect(buildMongoFilterFromQueryBuilder(root)).toEqual(expectedFilter);
    },
  );
});
