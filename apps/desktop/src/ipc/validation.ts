import { z } from "zod";

export const voidPayloadSchema = z.undefined();

const connectionEnvironmentSchema = z.enum([
  "local",
  "development",
  "staging",
  "production",
]);

const mongoConnectionNameSchema = z.string().trim().min(1).max(80);

const mongoConnectionUriSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      const parsedUri = new URL(value);
      return (
        (parsedUri.protocol === "mongodb:" ||
          parsedUri.protocol === "mongodb+srv:") &&
        parsedUri.hostname.length > 0
      );
    } catch {
      return false;
    }
  }, "URI must use mongodb:// or mongodb+srv://");

export const connectionIdPayloadSchema = z.object({
  connectionId: z.string().min(1),
});

export const connectionCreatePayloadSchema = z.object({
  environment: connectionEnvironmentSchema,
  name: mongoConnectionNameSchema,
  readOnly: z.boolean(),
  uri: mongoConnectionUriSchema,
});

export const connectionUpdatePayloadSchema = z
  .object({
    connectionId: z.string().min(1),
    environment: connectionEnvironmentSchema.optional(),
    name: mongoConnectionNameSchema.optional(),
    readOnly: z.boolean().optional(),
    uri: mongoConnectionUriSchema.optional(),
  })
  .refine(
    (payload) =>
      payload.environment !== undefined ||
      payload.name !== undefined ||
      payload.readOnly !== undefined ||
      payload.uri !== undefined,
    "At least one connection field must be updated",
  );

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
export type ConnectionCreatePayload = z.infer<
  typeof connectionCreatePayloadSchema
>;
export type ConnectionUpdatePayload = z.infer<
  typeof connectionUpdatePayloadSchema
>;
export type ExplorerChildrenPayload = z.infer<
  typeof explorerChildrenPayloadSchema
>;
export type MongodbFindDocumentsPayload = z.infer<
  typeof mongodbFindDocumentsPayloadSchema
>;
export type AuditListPayload = z.infer<typeof auditListPayloadSchema>;
