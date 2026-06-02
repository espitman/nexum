import { describe, expect, it } from "vitest";
import { validateMongoConnectionInput } from "./connectionSchema";

const validInput = {
  environment: "production",
  name: "Production MongoDB",
  readOnly: true,
  uri: "mongodb+srv://user:password@cluster0.example.mongodb.net/app",
};

describe("validateMongoConnectionInput", () => {
  it("accepts valid MongoDB connection input", () => {
    const result = validateMongoConnectionInput(validInput);

    expect(result).toMatchObject({
      ok: true,
      value: {
        environment: "production",
        name: "Production MongoDB",
        readOnly: true,
      },
    });
  });

  it("accepts replica set URIs with multiple hosts", () => {
    const result = validateMongoConnectionInput({
      ...validInput,
      uri: "mongodb://user:password@mongo-stg-a.alibaba.local:27017,mongo-stg-b.alibaba.local:27017,mongo-stg-c.alibaba.local:27017/merchandising-db?replicaSet=rs0&authSource=admin",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        uri: expect.stringContaining("replicaSet=rs0"),
      },
    });
  });

  it("validates connection name", () => {
    const result = validateMongoConnectionInput({ ...validInput, name: " " });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        details: {
          issues: [
            {
              field: "name",
              message: "Name must be between 1 and 80 characters",
            },
          ],
        },
      },
    });
  });

  it("validates MongoDB URI protocol", () => {
    const result = validateMongoConnectionInput({
      ...validInput,
      uri: "postgres://user:password@localhost/app",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        details: {
          issues: [
            {
              field: "uri",
              message: "URI must use mongodb:// or mongodb+srv://",
            },
          ],
        },
      },
    });
  });

  it("validates environment", () => {
    const result = validateMongoConnectionInput({
      ...validInput,
      environment: "prod",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        details: {
          issues: [
            {
              field: "environment",
              message: "Environment is not supported",
            },
          ],
        },
      },
    });
  });

  it("validates read-only mode", () => {
    const result = validateMongoConnectionInput({
      ...validInput,
      readOnly: "yes",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        details: {
          issues: [
            {
              field: "readOnly",
              message: "Read-only mode must be a boolean",
            },
          ],
        },
      },
    });
  });

  it("does not leak the URI in validation error details", () => {
    const result = validateMongoConnectionInput({
      ...validInput,
      uri: "not-a-mongodb-uri",
    });

    expect(JSON.stringify(result)).not.toContain("not-a-mongodb-uri");
  });
});
