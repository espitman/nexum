import { AppError, err, ok, type Result } from "@nexum/shared";
import { describe, expect, it } from "vitest";
import type {
  ConnectionLifecycleService,
  MongoCollectionMetadata,
} from "../connections";
import { MongoExplorerService } from "./mongoExplorerService";

class FakeConnectionLifecycle {
  collections: MongoCollectionMetadata[] = [
    { name: "orders", type: "collection" },
    { name: "activeUsers", type: "view" },
    { name: "users", type: "collection" },
  ];
  databases = ["admin", "app"];
  isActive = true;

  listCollections(
    _connectionId: string,
    _databaseName: string,
  ): Result<Promise<MongoCollectionMetadata[]>, AppError> {
    if (!this.isActive) {
      return err(
        new AppError("CONNECTION_NOT_ACTIVE", "Connection is not active"),
      );
    }

    return ok(Promise.resolve(this.collections));
  }

  listDatabases(): Result<Promise<string[]>, AppError> {
    if (!this.isActive) {
      return err(
        new AppError("CONNECTION_NOT_ACTIVE", "Connection is not active"),
      );
    }

    return ok(Promise.resolve(this.databases));
  }
}

const createExplorer = () => {
  const lifecycle = new FakeConnectionLifecycle();
  const explorer = new MongoExplorerService(
    lifecycle as unknown as ConnectionLifecycleService,
  );

  return { explorer, lifecycle };
};

describe("MongoExplorerService", () => {
  it("returns typed database root nodes", async () => {
    const { explorer } = createExplorer();

    const result = await explorer.listRootNodes("conn_local");

    expect(result).toMatchObject({
      ok: true,
      value: [
        { label: "admin", type: "database" },
        { label: "app", type: "database" },
      ],
    });
  });

  it("returns collection and view folders for database nodes", async () => {
    const { explorer } = createExplorer();

    const result = await explorer.listChildren(
      "conn_local",
      "mongodb:conn_local:database:app",
    );

    expect(result).toMatchObject({
      ok: true,
      value: [
        { label: "collections", type: "folder" },
        { label: "views", type: "folder" },
      ],
    });
  });

  it("distinguishes collections and views under folders", async () => {
    const { explorer } = createExplorer();

    const collections = await explorer.listChildren(
      "conn_local",
      "mongodb:conn_local:database:app:folder:collections",
    );
    const views = await explorer.listChildren(
      "conn_local",
      "mongodb:conn_local:database:app:folder:views",
    );

    expect(collections).toMatchObject({
      ok: true,
      value: [
        { label: "orders", type: "collection" },
        { label: "users", type: "collection" },
      ],
    });
    expect(views).toMatchObject({
      ok: true,
      value: [{ label: "activeUsers", type: "view" }],
    });
  });

  it("returns inactive connection errors", async () => {
    const { explorer, lifecycle } = createExplorer();
    lifecycle.isActive = false;

    const result = await explorer.listRootNodes("conn_local");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CONNECTION_NOT_ACTIVE" },
    });
  });
});
