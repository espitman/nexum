import type { ConnectionEnvironment } from "@nexum/core";
import { AppError, err, ok, type Result } from "@nexum/shared";
import ConnectionString from "mongodb-connection-string-url";

export type MongoConnectionInput = {
  environment: ConnectionEnvironment;
  name: string;
  readOnly: boolean;
  uri: string;
};

export type MongoConnectionField = keyof MongoConnectionInput;

export type MongoConnectionValidationIssue = {
  field: MongoConnectionField;
  message: string;
};

export const mongoConnectionEnvironments = [
  "local",
  "development",
  "staging",
  "production",
] as const satisfies readonly ConnectionEnvironment[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isMongoConnectionEnvironment = (
  value: unknown,
): value is ConnectionEnvironment =>
  typeof value === "string" &&
  mongoConnectionEnvironments.includes(value as ConnectionEnvironment);

const validateMongoUri = (value: unknown): boolean => {
  if (typeof value !== "string") {
    return false;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return false;
  }

  try {
    const parsedUri = new ConnectionString(trimmedValue);
    return (
      (parsedUri.protocol === "mongodb:" ||
        parsedUri.protocol === "mongodb+srv:") &&
      parsedUri.hosts.length > 0
    );
  } catch {
    return false;
  }
};

export const validateMongoConnectionInput = (
  input: unknown,
): Result<MongoConnectionInput, AppError> => {
  const issues: MongoConnectionValidationIssue[] = [];

  if (!isRecord(input)) {
    return err(
      new AppError("VALIDATION_FAILED", "Connection input must be an object"),
    );
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";

  if (name.length < 1 || name.length > 80) {
    issues.push({
      field: "name",
      message: "Name must be between 1 and 80 characters",
    });
  }

  if (!validateMongoUri(input.uri)) {
    issues.push({
      field: "uri",
      message: "URI must use mongodb:// or mongodb+srv://",
    });
  }

  if (!isMongoConnectionEnvironment(input.environment)) {
    issues.push({
      field: "environment",
      message: "Environment is not supported",
    });
  }

  if (typeof input.readOnly !== "boolean") {
    issues.push({
      field: "readOnly",
      message: "Read-only mode must be a boolean",
    });
  }

  if (issues.length > 0) {
    return err(
      new AppError("VALIDATION_FAILED", "MongoDB connection input is invalid", {
        details: { issues },
      }),
    );
  }

  return ok({
    environment: input.environment as ConnectionEnvironment,
    name,
    readOnly: input.readOnly as boolean,
    uri: (input.uri as string).trim(),
  });
};
