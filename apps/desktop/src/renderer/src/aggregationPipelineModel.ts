export const aggregationPipelineStageTypes = [
  "match",
  "project",
  "sort",
  "limit",
  "skip",
  "count",
  "group",
  "unwind",
] as const;

export type AggregationPipelineStageType =
  (typeof aggregationPipelineStageTypes)[number];

export type AggregationStageBase = {
  enabled: boolean;
  id: string;
  type: AggregationPipelineStageType;
};

export type MatchAggregationStage = AggregationStageBase & {
  filter: Record<string, unknown>;
  type: "match";
};

export type ProjectAggregationStage = AggregationStageBase & {
  projection: Record<string, unknown>;
  type: "project";
};

export type SortAggregationStage = AggregationStageBase & {
  sort: Record<string, 1 | -1>;
  type: "sort";
};

export type LimitAggregationStage = AggregationStageBase & {
  limit: number;
  type: "limit";
};

export type SkipAggregationStage = AggregationStageBase & {
  skip: number;
  type: "skip";
};

export type CountAggregationStage = AggregationStageBase & {
  field: string;
  type: "count";
};

export type GroupAggregationStage = AggregationStageBase & {
  accumulators: Record<string, unknown>;
  idExpression: unknown;
  type: "group";
};

export type UnwindAggregationStage = AggregationStageBase & {
  includeArrayIndex?: string;
  path: string;
  preserveNullAndEmptyArrays?: boolean;
  type: "unwind";
};

export type AggregationPipelineStage =
  | CountAggregationStage
  | GroupAggregationStage
  | LimitAggregationStage
  | MatchAggregationStage
  | ProjectAggregationStage
  | SkipAggregationStage
  | SortAggregationStage
  | UnwindAggregationStage;

export type AggregationPipelineModel = {
  stages: AggregationPipelineStage[];
};

export type AggregationPipelineStageInput =
  | Partial<Omit<CountAggregationStage, "type">>
  | Partial<Omit<GroupAggregationStage, "type">>
  | Partial<Omit<LimitAggregationStage, "type">>
  | Partial<Omit<MatchAggregationStage, "type">>
  | Partial<Omit<ProjectAggregationStage, "type">>
  | Partial<Omit<SkipAggregationStage, "type">>
  | Partial<Omit<SortAggregationStage, "type">>
  | Partial<Omit<UnwindAggregationStage, "type">>;

export type AggregationPipelineStagePatch = Partial<
  Omit<CountAggregationStage, "id" | "type"> &
    Omit<GroupAggregationStage, "id" | "type"> &
    Omit<LimitAggregationStage, "id" | "type"> &
    Omit<MatchAggregationStage, "id" | "type"> &
    Omit<ProjectAggregationStage, "id" | "type"> &
    Omit<SkipAggregationStage, "id" | "type"> &
    Omit<SortAggregationStage, "id" | "type"> &
    Omit<UnwindAggregationStage, "id" | "type">
>;

export const allowedAggregationStageNames = new Set([
  "$match",
  "$project",
  "$sort",
  "$limit",
  "$skip",
  "$count",
  "$group",
  "$unwind",
]);

export const blockedAggregationStageNames = new Set([
  "$accumulator",
  "$function",
  "$merge",
  "$out",
]);

let fallbackAggregationId = 0;

export const createDefaultAggregationPipelineModel =
  (): AggregationPipelineModel => ({
    stages: [],
  });

export const createAggregationPipelineStage = (
  type: AggregationPipelineStageType,
  input: AggregationPipelineStageInput = {},
): AggregationPipelineStage => {
  const base = {
    enabled: input.enabled ?? true,
    id: input.id ?? createAggregationPipelineStageId(type),
  };

  switch (type) {
    case "match":
      return {
        ...base,
        filter: getRecordInput(input, "filter"),
        type,
      };
    case "project":
      return {
        ...base,
        projection: getRecordInput(input, "projection"),
        type,
      };
    case "sort":
      return {
        ...base,
        sort: getSortInput(input),
        type,
      };
    case "limit":
      return {
        ...base,
        limit: getNumberInput(input, "limit", 50),
        type,
      };
    case "skip":
      return {
        ...base,
        skip: getNumberInput(input, "skip", 0),
        type,
      };
    case "count":
      return {
        ...base,
        field: getStringInput(input, "field", "count"),
        type,
      };
    case "group":
      return {
        ...base,
        accumulators: getRecordInput(input, "accumulators"),
        idExpression: "idExpression" in input ? input.idExpression : null,
        type,
      };
    case "unwind": {
      const includeArrayIndex = getOptionalStringInput(
        input,
        "includeArrayIndex",
      );
      const stage: UnwindAggregationStage = {
        ...base,
        path: getStringInput(input, "path", ""),
        type,
      };

      if (includeArrayIndex) {
        stage.includeArrayIndex = includeArrayIndex;
      }

      if ("preserveNullAndEmptyArrays" in input) {
        stage.preserveNullAndEmptyArrays = Boolean(
          input.preserveNullAndEmptyArrays,
        );
      }

      return stage;
    }
  }
};

export const addAggregationPipelineStage = (
  model: AggregationPipelineModel,
  stage: AggregationPipelineStage,
  index = model.stages.length,
): AggregationPipelineModel => {
  const nextStages = [...model.stages];
  const boundedIndex = Math.max(0, Math.min(index, nextStages.length));
  nextStages.splice(boundedIndex, 0, stage);

  return { stages: nextStages };
};

export const removeAggregationPipelineStage = (
  model: AggregationPipelineModel,
  stageId: string,
): AggregationPipelineModel => ({
  stages: model.stages.filter((stage) => stage.id !== stageId),
});

export const updateAggregationPipelineStage = (
  model: AggregationPipelineModel,
  stageId: string,
  patch: AggregationPipelineStagePatch,
): AggregationPipelineModel => ({
  stages: model.stages.map((stage) =>
    stage.id === stageId
      ? ({ ...stage, ...patch } as AggregationPipelineStage)
      : stage,
  ),
});

export const setAggregationPipelineStageEnabled = (
  model: AggregationPipelineModel,
  stageId: string,
  enabled: boolean,
): AggregationPipelineModel =>
  updateAggregationPipelineStage(model, stageId, { enabled });

export const moveAggregationPipelineStage = (
  model: AggregationPipelineModel,
  stageId: string,
  direction: "down" | "up",
): AggregationPipelineModel => {
  const currentIndex = model.stages.findIndex((stage) => stage.id === stageId);

  if (currentIndex === -1) {
    return model;
  }

  const nextIndex =
    direction === "up"
      ? Math.max(0, currentIndex - 1)
      : Math.min(model.stages.length - 1, currentIndex + 1);

  return reorderAggregationPipelineStage(model, currentIndex, nextIndex);
};

export const reorderAggregationPipelineStage = (
  model: AggregationPipelineModel,
  fromIndex: number,
  toIndex: number,
): AggregationPipelineModel => {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= model.stages.length ||
    toIndex >= model.stages.length
  ) {
    return model;
  }

  const nextStages = [...model.stages];
  const [stage] = nextStages.splice(fromIndex, 1);

  if (!stage) {
    return model;
  }

  nextStages.splice(toIndex, 0, stage);
  return { stages: nextStages };
};

export const buildRawPipelineFromAggregationModel = (
  model: AggregationPipelineModel,
): Record<string, unknown>[] => {
  const pipeline = model.stages
    .filter((stage) => stage.enabled)
    .map(buildRawStage)
    .filter((stage): stage is Record<string, unknown> => stage !== null);

  validateRawAggregationPipeline(pipeline);
  return pipeline;
};

export const validateRawAggregationPipeline = (
  pipeline: Record<string, unknown>[],
) => {
  pipeline.forEach((stage, index) => {
    const stageNames = Object.keys(stage);

    if (stageNames.length !== 1) {
      throw new Error("Each aggregation stage must contain exactly one operator");
    }

    const stageName = stageNames[0];

    if (!stageName) {
      throw new Error("Aggregation stage operator is missing");
    }

    if (blockedAggregationStageNames.has(stageName)) {
      throw new Error(`Blocked aggregation stage: ${stageName}`);
    }

    if (!allowedAggregationStageNames.has(stageName)) {
      throw new Error(`Unsupported aggregation stage in MVP: ${stageName}`);
    }

    validateBlockedAggregationOperators(stage[stageName]);
    validateAggregationStagePayload(stageName, stage[stageName], index);
  });
};

const buildRawStage = (
  stage: AggregationPipelineStage,
): Record<string, unknown> | null => {
  switch (stage.type) {
    case "match":
      return { $match: stage.filter };
    case "project":
      return { $project: stage.projection };
    case "sort":
      return Object.keys(stage.sort).length > 0 ? { $sort: stage.sort } : null;
    case "limit":
      return stage.limit > 0 ? { $limit: stage.limit } : null;
    case "skip":
      return stage.skip > 0 ? { $skip: stage.skip } : null;
    case "count":
      return stage.field.trim() ? { $count: stage.field.trim() } : null;
    case "group":
      return {
        $group: {
          _id: stage.idExpression,
          ...stage.accumulators,
        },
      };
    case "unwind": {
      const path = normalizeUnwindPath(stage.path);

      if (!path) {
        return null;
      }

      if (
        !stage.includeArrayIndex &&
        stage.preserveNullAndEmptyArrays === undefined
      ) {
        return { $unwind: path };
      }

      return {
        $unwind: {
          path,
          ...(stage.includeArrayIndex
            ? { includeArrayIndex: stage.includeArrayIndex }
            : {}),
          ...(stage.preserveNullAndEmptyArrays === undefined
            ? {}
            : {
                preserveNullAndEmptyArrays:
                  stage.preserveNullAndEmptyArrays,
              }),
        },
      };
    }
  }
};

const createAggregationPipelineStageId = (type: string): string => {
  const randomId = globalThis.crypto?.randomUUID?.();

  if (randomId) {
    return `${type}_${randomId}`;
  }

  fallbackAggregationId += 1;
  return `${type}_${fallbackAggregationId}`;
};

const getRecordInput = (
  input: AggregationPipelineStageInput,
  key: string,
): Record<string, unknown> => {
  const value = (input as Record<string, unknown>)[key];

  return isPlainAggregationRecord(value) ? value : {};
};

const getSortInput = (
  input: AggregationPipelineStageInput,
): Record<string, 1 | -1> => {
  const value = (input as Record<string, unknown>).sort;

  if (!isPlainAggregationRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, 1 | -1] => {
      const [, direction] = entry;
      return direction === 1 || direction === -1;
    }),
  );
};

const getNumberInput = (
  input: AggregationPipelineStageInput,
  key: string,
  fallback: number,
): number => {
  const value = (input as Record<string, unknown>)[key];

  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
};

const getStringInput = (
  input: AggregationPipelineStageInput,
  key: string,
  fallback: string,
): string => {
  const value = (input as Record<string, unknown>)[key];

  return typeof value === "string" ? value : fallback;
};

const getOptionalStringInput = (
  input: AggregationPipelineStageInput,
  key: string,
): string | undefined => {
  const value = (input as Record<string, unknown>)[key];

  return typeof value === "string" && value.trim() ? value : undefined;
};

const normalizeUnwindPath = (path: string): string => {
  const trimmedPath = path.trim();

  if (!trimmedPath) {
    return "";
  }

  return trimmedPath.startsWith("$") ? trimmedPath : `$${trimmedPath}`;
};

const isPlainAggregationRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const validateBlockedAggregationOperators = (
  value: unknown,
  path = "pipeline",
) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateBlockedAggregationOperators(item, `${path}[${index}]`),
    );
    return;
  }

  if (!isPlainAggregationRecord(value)) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (blockedAggregationStageNames.has(key)) {
      throw new Error(`Blocked aggregation stage: ${key}`);
    }

    validateBlockedAggregationOperators(nestedValue, `${path}.${key}`);
  }
};

const validateAggregationStagePayload = (
  stageName: string,
  payload: unknown,
  index: number,
) => {
  switch (stageName) {
    case "$match":
    case "$project":
    case "$group":
      if (!isPlainAggregationRecord(payload)) {
        throw new Error(`${stageName} stage at index ${index} must be an object`);
      }
      break;
    case "$sort":
      validateSortPayload(payload, index);
      break;
    case "$limit":
    case "$skip":
      if (!isNonNegativeInteger(payload)) {
        throw new Error(
          `${stageName} stage at index ${index} must be a non-negative integer`,
        );
      }
      break;
    case "$count":
      if (typeof payload !== "string" || !payload.trim()) {
        throw new Error(
          `${stageName} stage at index ${index} must be a non-empty string`,
        );
      }
      break;
    case "$unwind":
      validateUnwindPayload(payload, index);
      break;
  }
};

const validateSortPayload = (payload: unknown, index: number) => {
  if (!isPlainAggregationRecord(payload)) {
    throw new Error(`$sort stage at index ${index} must be an object`);
  }

  for (const [field, direction] of Object.entries(payload)) {
    if (direction !== 1 && direction !== -1) {
      throw new Error(
        `$sort field "${field}" at index ${index} must be 1 or -1`,
      );
    }
  }
};

const validateUnwindPayload = (payload: unknown, index: number) => {
  if (typeof payload === "string") {
    if (!payload.trim()) {
      throw new Error(`$unwind stage at index ${index} must include a path`);
    }
    return;
  }

  if (!isPlainAggregationRecord(payload)) {
    throw new Error(`$unwind stage at index ${index} must be a string or object`);
  }

  if (typeof payload.path !== "string" || !payload.path.trim()) {
    throw new Error(`$unwind stage at index ${index} must include a path`);
  }

  if (
    "includeArrayIndex" in payload &&
    typeof payload.includeArrayIndex !== "string"
  ) {
    throw new Error(
      `$unwind includeArrayIndex at index ${index} must be a string`,
    );
  }

  if (
    "preserveNullAndEmptyArrays" in payload &&
    typeof payload.preserveNullAndEmptyArrays !== "boolean"
  ) {
    throw new Error(
      `$unwind preserveNullAndEmptyArrays at index ${index} must be a boolean`,
    );
  }
};

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;
