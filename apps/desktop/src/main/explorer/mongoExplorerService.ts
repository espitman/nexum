import { AppError, err, ok, type Result } from "@nexum/shared";
import type { ExplorerNodeDto } from "../../ipc/contracts";
import type {
  ConnectionLifecycleService,
  MongoCollectionMetadata,
} from "../connections";

type ExplorerFolderKind = "collections" | "views";

type ParsedExplorerNodeId =
  | { type: "database"; databaseName: string }
  | { type: "folder"; databaseName: string; folder: ExplorerFolderKind };

const pluginId = "mongodb";

export class MongoExplorerService {
  readonly #connections: ConnectionLifecycleService;

  constructor(connections: ConnectionLifecycleService) {
    this.#connections = connections;
  }

  async listChildren(
    connectionId: string,
    nodeId: string,
  ): Promise<Result<ExplorerNodeDto[], AppError>> {
    const parsedNodeId = parseExplorerNodeId(connectionId, nodeId);

    if (!parsedNodeId.ok) {
      return parsedNodeId;
    }

    if (parsedNodeId.value.type === "database") {
      return ok([
        createFolderNode(connectionId, parsedNodeId.value.databaseName, {
          folder: "collections",
          hasChildren: true,
          label: "collections",
        }),
        createFolderNode(connectionId, parsedNodeId.value.databaseName, {
          folder: "views",
          hasChildren: true,
          label: "views",
        }),
      ]);
    }

    const folderNode = parsedNodeId.value;
    const collectionsResult = this.#connections.listCollections(
      connectionId,
      folderNode.databaseName,
    );

    if (!collectionsResult.ok) {
      return collectionsResult;
    }

    const collections = await collectionsResult.value;
    return ok(
      collections
        .filter((collection) =>
          folderNode.folder === "views"
            ? collection.type === "view"
            : collection.type === "collection",
        )
        .map((collection) =>
          createCollectionNode(
            connectionId,
            folderNode.databaseName,
            collection,
          ),
        ),
    );
  }

  async listRootNodes(
    connectionId: string,
  ): Promise<Result<ExplorerNodeDto[], AppError>> {
    const databasesResult = this.#connections.listDatabases(connectionId);

    if (!databasesResult.ok) {
      return databasesResult;
    }

    const databases = await databasesResult.value;
    return ok(
      databases.map((databaseName) =>
        createDatabaseNode(connectionId, databaseName),
      ),
    );
  }
}

const createCollectionNode = (
  connectionId: string,
  databaseName: string,
  collection: MongoCollectionMetadata,
): ExplorerNodeDto => ({
  connectionId,
  hasChildren: false,
  id: createCollectionNodeId(connectionId, databaseName, collection.name),
  label: collection.name,
  metadata: { databaseName },
  path: [databaseName, collection.name],
  pluginId,
  type: collection.type,
});

const createDatabaseNode = (
  connectionId: string,
  databaseName: string,
): ExplorerNodeDto => ({
  connectionId,
  hasChildren: true,
  id: createDatabaseNodeId(connectionId, databaseName),
  label: databaseName,
  path: [databaseName],
  pluginId,
  type: "database",
});

const createFolderNode = (
  connectionId: string,
  databaseName: string,
  options: {
    folder: ExplorerFolderKind;
    hasChildren: boolean;
    label: string;
  },
): ExplorerNodeDto => ({
  connectionId,
  hasChildren: options.hasChildren,
  id: createFolderNodeId(connectionId, databaseName, options.folder),
  label: options.label,
  metadata: { databaseName, folder: options.folder },
  path: [databaseName, options.folder],
  pluginId,
  type: "folder",
});

const createCollectionNodeId = (
  connectionId: string,
  databaseName: string,
  collectionName: string,
): string =>
  [
    pluginId,
    encodeNodePart(connectionId),
    "database",
    encodeNodePart(databaseName),
    "collection",
    encodeNodePart(collectionName),
  ].join(":");

const createDatabaseNodeId = (
  connectionId: string,
  databaseName: string,
): string =>
  [
    pluginId,
    encodeNodePart(connectionId),
    "database",
    encodeNodePart(databaseName),
  ].join(":");

const createFolderNodeId = (
  connectionId: string,
  databaseName: string,
  folder: ExplorerFolderKind,
): string =>
  [
    pluginId,
    encodeNodePart(connectionId),
    "database",
    encodeNodePart(databaseName),
    "folder",
    folder,
  ].join(":");

const decodeNodePart = (value: string): string =>
  decodeURIComponent(value.replace(/\+/g, "%20"));

const encodeNodePart = (value: string): string => encodeURIComponent(value);

const parseExplorerNodeId = (
  connectionId: string,
  nodeId: string,
): Result<ParsedExplorerNodeId, AppError> => {
  const parts = nodeId.split(":");

  if (
    parts[0] !== pluginId ||
    decodeNodePart(parts[1] ?? "") !== connectionId ||
    parts[2] !== "database" ||
    !parts[3]
  ) {
    return err(createInvalidNodeError(connectionId, nodeId));
  }

  const databaseName = decodeNodePart(parts[3]);

  if (parts.length === 4) {
    return ok({ databaseName, type: "database" });
  }

  if (
    parts.length === 6 &&
    parts[4] === "folder" &&
    (parts[5] === "collections" || parts[5] === "views")
  ) {
    return ok({
      databaseName,
      folder: parts[5],
      type: "folder",
    });
  }

  return err(createInvalidNodeError(connectionId, nodeId));
};

const createInvalidNodeError = (
  connectionId: string,
  nodeId: string,
): AppError =>
  new AppError("VALIDATION_FAILED", "Invalid explorer node", {
    details: { connectionId, nodeId },
  });
