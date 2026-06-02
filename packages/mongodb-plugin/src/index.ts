import type { PluginCapabilities } from "@nexum/core";

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
