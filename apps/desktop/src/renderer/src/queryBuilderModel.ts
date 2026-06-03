export const queryBuilderCombinators = ["and", "or"] as const;

export type QueryBuilderCombinator = (typeof queryBuilderCombinators)[number];

export const queryBuilderConditionOperators = [
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
] as const;

export type QueryBuilderConditionOperator =
  (typeof queryBuilderConditionOperators)[number];

export type QueryBuilderConditionNode = {
  enabled: boolean;
  field: string;
  id: string;
  kind: "condition";
  operator: QueryBuilderConditionOperator;
  value: unknown;
};

export type QueryBuilderGroupNode = {
  children: QueryBuilderNode[];
  combinator: QueryBuilderCombinator;
  enabled: boolean;
  id: string;
  kind: "group";
};

export type QueryBuilderNode =
  | QueryBuilderConditionNode
  | QueryBuilderGroupNode;

export type QueryBuilderFieldInference = {
  occurrenceCount: number;
  path: string;
  sampleCount: number;
  types: string[];
};

export type QueryBuilderConditionInput = Partial<
  Omit<QueryBuilderConditionNode, "kind">
>;

export type QueryBuilderGroupInput = Partial<
  Omit<QueryBuilderGroupNode, "kind">
>;

let fallbackId = 0;

export const createQueryBuilderCondition = (
  input: QueryBuilderConditionInput = {},
): QueryBuilderConditionNode => ({
  enabled: input.enabled ?? true,
  field: input.field ?? "",
  id: input.id ?? createQueryBuilderNodeId("condition"),
  kind: "condition",
  operator: input.operator ?? "equals",
  value: input.value ?? "",
});

export const createQueryBuilderGroup = (
  input: QueryBuilderGroupInput = {},
): QueryBuilderGroupNode => ({
  children: input.children ?? [],
  combinator: input.combinator ?? "and",
  enabled: input.enabled ?? true,
  id: input.id ?? createQueryBuilderNodeId("group"),
  kind: "group",
});

export const createDefaultQueryBuilderModel = (): QueryBuilderGroupNode =>
  createQueryBuilderGroup({
    children: [createQueryBuilderCondition()],
    id: "root",
  });

export const addQueryBuilderNode = (
  root: QueryBuilderGroupNode,
  parentId: string,
  node: QueryBuilderNode,
): QueryBuilderGroupNode =>
  updateQueryBuilderTree(root, (currentNode) => {
    if (currentNode.kind !== "group" || currentNode.id !== parentId) {
      return currentNode;
    }

    return {
      ...currentNode,
      children: [...currentNode.children, node],
    };
  }) as QueryBuilderGroupNode;

export const removeQueryBuilderNode = (
  root: QueryBuilderGroupNode,
  nodeId: string,
): QueryBuilderGroupNode => {
  if (root.id === nodeId) {
    return root;
  }

  return updateQueryBuilderTree(root, (currentNode) => {
    if (currentNode.kind !== "group") {
      return currentNode;
    }

    return {
      ...currentNode,
      children: currentNode.children.filter((child) => child.id !== nodeId),
    };
  }) as QueryBuilderGroupNode;
};

export const updateQueryBuilderCondition = (
  root: QueryBuilderGroupNode,
  conditionId: string,
  patch: Partial<Omit<QueryBuilderConditionNode, "id" | "kind">>,
): QueryBuilderGroupNode =>
  updateQueryBuilderTree(root, (currentNode) => {
    if (currentNode.kind !== "condition" || currentNode.id !== conditionId) {
      return currentNode;
    }

    return {
      ...currentNode,
      ...patch,
    };
  }) as QueryBuilderGroupNode;

export const updateQueryBuilderGroup = (
  root: QueryBuilderGroupNode,
  groupId: string,
  patch: Partial<Omit<QueryBuilderGroupNode, "children" | "id" | "kind">>,
): QueryBuilderGroupNode =>
  updateQueryBuilderTree(root, (currentNode) => {
    if (currentNode.kind !== "group" || currentNode.id !== groupId) {
      return currentNode;
    }

    return {
      ...currentNode,
      ...patch,
    };
  }) as QueryBuilderGroupNode;

export const buildMongoFilterFromQueryBuilder = (
  root: QueryBuilderGroupNode,
): Record<string, unknown> => buildMongoFilterForNode(root) ?? {};

export const inferQueryBuilderFields = (
  documents: Record<string, unknown>[],
  options: { sampleSize?: number } = {},
): QueryBuilderFieldInference[] => {
  const sampleSize = options.sampleSize ?? 100;
  const fields = new Map<
    string,
    {
      occurrenceIndexes: Set<number>;
      sampleCount: number;
      types: Set<string>;
    }
  >();

  documents.slice(0, sampleSize).forEach((document, index) => {
    const seenPaths = new Set<string>();
    collectQueryBuilderFields(document, "", fields, seenPaths);

    for (const path of seenPaths) {
      fields.get(path)?.occurrenceIndexes.add(index);
    }
  });

  return [...fields.entries()]
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
    .map(([path, field]) => ({
      occurrenceCount: field.occurrenceIndexes.size,
      path,
      sampleCount: field.sampleCount,
      types: [...field.types].sort(),
    }));
};

export const isQueryBuilderGroupNode = (
  node: QueryBuilderNode,
): node is QueryBuilderGroupNode => node.kind === "group";

export const isQueryBuilderConditionNode = (
  node: QueryBuilderNode,
): node is QueryBuilderConditionNode => node.kind === "condition";

const updateQueryBuilderTree = (
  node: QueryBuilderNode,
  updateNode: (node: QueryBuilderNode) => QueryBuilderNode,
): QueryBuilderNode => {
  const updatedNode = updateNode(node);

  if (updatedNode.kind !== "group") {
    return updatedNode;
  }

  return {
    ...updatedNode,
    children: updatedNode.children.map((child) =>
      updateQueryBuilderTree(child, updateNode),
    ),
  };
};

const buildMongoFilterForNode = (
  node: QueryBuilderNode,
): Record<string, unknown> | null => {
  if (!node.enabled) {
    return null;
  }

  if (node.kind === "condition") {
    return buildMongoFilterForCondition(node);
  }

  const childFilters = node.children
    .map(buildMongoFilterForNode)
    .filter((filter): filter is Record<string, unknown> => filter !== null);

  if (childFilters.length === 0) {
    return null;
  }

  if (childFilters.length === 1) {
    return childFilters[0] ?? null;
  }

  return {
    [node.combinator === "and" ? "$and" : "$or"]: childFilters,
  };
};

const buildMongoFilterForCondition = (
  condition: QueryBuilderConditionNode,
): Record<string, unknown> | null => {
  const field = condition.field.trim();

  if (!field) {
    return null;
  }

  switch (condition.operator) {
    case "equals":
      return { [field]: condition.value };
    case "notEquals":
      return { [field]: { $ne: condition.value } };
    case "greaterThan":
      return { [field]: { $gt: condition.value } };
    case "greaterThanOrEqual":
      return { [field]: { $gte: condition.value } };
    case "lessThan":
      return { [field]: { $lt: condition.value } };
    case "lessThanOrEqual":
      return { [field]: { $lte: condition.value } };
    case "contains":
      return {
        [field]: {
          $options: "i",
          $regex: escapeRegex(String(condition.value)),
        },
      };
    case "exists":
      return { [field]: { $exists: condition.value !== false } };
    case "in":
      return { [field]: { $in: toQueryBuilderValueList(condition.value) } };
    case "notIn":
      return { [field]: { $nin: toQueryBuilderValueList(condition.value) } };
    case "regex":
      return { [field]: { $regex: String(condition.value) } };
  }
};

const createQueryBuilderNodeId = (prefix: string): string => {
  const randomId = globalThis.crypto?.randomUUID?.();

  if (randomId) {
    return `${prefix}_${randomId}`;
  }

  fallbackId += 1;
  return `${prefix}_${fallbackId}`;
};

const toQueryBuilderValueList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [value];

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const collectQueryBuilderFields = (
  value: Record<string, unknown>,
  prefix: string,
  fields: Map<
    string,
    {
      occurrenceIndexes: Set<number>;
      sampleCount: number;
      types: Set<string>;
    }
  >,
  seenPaths: Set<string>,
) => {
  for (const [key, fieldValue] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    addQueryBuilderFieldSample(path, fieldValue, fields, seenPaths);

    if (isPlainQueryBuilderObject(fieldValue)) {
      collectQueryBuilderFields(
        fieldValue as Record<string, unknown>,
        path,
        fields,
        seenPaths,
      );
      continue;
    }

    if (Array.isArray(fieldValue)) {
      fieldValue.forEach((item) => {
        if (isPlainQueryBuilderObject(item)) {
          collectQueryBuilderFields(
            item as Record<string, unknown>,
            path,
            fields,
            seenPaths,
          );
        }
      });
    }
  }
};

const addQueryBuilderFieldSample = (
  path: string,
  value: unknown,
  fields: Map<
    string,
    {
      occurrenceIndexes: Set<number>;
      sampleCount: number;
      types: Set<string>;
    }
  >,
  seenPaths: Set<string>,
) => {
  const field = fields.get(path) ?? {
    occurrenceIndexes: new Set<number>(),
    sampleCount: 0,
    types: new Set<string>(),
  };

  field.sampleCount += 1;
  field.types.add(getQueryBuilderValueType(value));
  fields.set(path, field);
  seenPaths.add(path);
};

const getQueryBuilderValueType = (value: unknown): string => {
  const ejsonType = getQueryBuilderEjsonType(value);

  if (ejsonType) {
    return ejsonType;
  }

  if (value === null) {
    return "Null";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "Array";
    }

    const itemTypes = new Set(
      value.map((item) => getQueryBuilderValueType(item)),
    );

    return `Array<${[...itemTypes].sort().join(" | ")}>`;
  }

  if (isRecord(value)) {
    return "Object";
  }

  if (typeof value === "boolean") {
    return "Boolean";
  }

  if (typeof value === "number") {
    return "Number";
  }

  if (typeof value === "string") {
    return "String";
  }

  return "Unknown";
};

const getQueryBuilderEjsonType = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }

  const keys = Object.keys(value);

  if (keys.length !== 1) {
    return null;
  }

  switch (keys[0]) {
    case "$binary":
      return "Binary";
    case "$date":
      return "Date";
    case "$numberDecimal":
      return "Decimal128";
    case "$numberDouble":
      return "Double";
    case "$numberInt":
      return "Int32";
    case "$numberLong":
      return "Long";
    case "$oid":
      return "ObjectId";
    case "$regularExpression":
      return "Regex";
    case "$timestamp":
      return "Timestamp";
    default:
      return null;
  }
};

const isPlainQueryBuilderObject = (value: unknown): boolean =>
  isRecord(value) && getQueryBuilderEjsonType(value) === null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
