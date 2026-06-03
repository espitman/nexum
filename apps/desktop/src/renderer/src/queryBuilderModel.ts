export const queryBuilderCombinators = ["and", "or"] as const;

export type QueryBuilderCombinator = (typeof queryBuilderCombinators)[number];

export type QueryBuilderConditionOperator = "equals";

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

  if (condition.operator === "equals") {
    return { [field]: condition.value };
  }

  return null;
};

const createQueryBuilderNodeId = (prefix: string): string => {
  const randomId = globalThis.crypto?.randomUUID?.();

  if (randomId) {
    return `${prefix}_${randomId}`;
  }

  fallbackId += 1;
  return `${prefix}_${fallbackId}`;
};
