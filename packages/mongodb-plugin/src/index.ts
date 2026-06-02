import type { NexumPlugin, PluginCapabilities } from "@nexum/core";
import { err } from "@nexum/shared";
import { validateMongoConnectionInput } from "./connectionSchema";

export * from "./connectionSchema";

export const mongodbPluginId = "mongodb";

export const mongodbCapabilities = {
  documents: true,
  tableView: true,
  jsonView: true,
  visualQueryBuilder: true,
  aggregationBuilder: true,
  documentEditing: true,
  schemaInference: true,
  readOnlyMode: true,
} satisfies PluginCapabilities;

export type MongoCollectionType = "collection" | "view";

export type MongoDatabaseInfo = {
  name: string;
  sizeOnDisk?: number;
  empty?: boolean;
};

export type MongoCollectionInfo = {
  name: string;
  type: MongoCollectionType;
  estimatedDocumentCount?: number;
};

const notImplemented = () =>
  err(new Error("MongoDB plugin runtime is not implemented yet"));

export const mongodbPlugin = {
  id: mongodbPluginId,
  name: "mongodb",
  displayName: "MongoDB",
  version: "0.0.0",
  capabilities: mongodbCapabilities,
  connection: {
    type: "mongodb",
    async validateInput(input) {
      return validateMongoConnectionInput(input);
    },
    async test() {
      return notImplemented();
    },
    async connect() {
      return notImplemented();
    },
    async disconnect() {
      return notImplemented();
    },
  },
  explorer: {
    async listRootNodes() {
      return notImplemented();
    },
    async listChildren() {
      return notImplemented();
    },
  },
} satisfies NexumPlugin;
