import { z } from "zod";

export const voidPayloadSchema = z.undefined();

export const connectionIdPayloadSchema = z.object({
  connectionId: z.string().min(1),
});

export const explorerChildrenPayloadSchema = z.object({
  connectionId: z.string().min(1),
  nodeId: z.string().min(1),
});

export const mongodbFindDocumentsPayloadSchema = z.object({
  collection: z.string().min(1),
  connectionId: z.string().min(1),
  database: z.string().min(1),
  filter: z.record(z.string(), z.unknown()).default({}),
  limit: z.number().int().min(1).max(500).default(50),
  skip: z.number().int().min(0).default(0),
});

export const auditListPayloadSchema = z
  .object({
    connectionId: z.string().min(1).optional(),
  })
  .optional();

export type ConnectionIdPayload = z.infer<typeof connectionIdPayloadSchema>;
export type ExplorerChildrenPayload = z.infer<
  typeof explorerChildrenPayloadSchema
>;
export type MongodbFindDocumentsPayload = z.infer<
  typeof mongodbFindDocumentsPayloadSchema
>;
export type AuditListPayload = z.infer<typeof auditListPayloadSchema>;
