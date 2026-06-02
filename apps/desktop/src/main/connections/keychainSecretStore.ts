import { AppError, err, ok, type Result } from "@nexum/shared";
import keytar from "keytar";

export interface ConnectionSecretRepository {
  getUri(connectionId: string): Promise<Result<string, AppError>>;
  removeUri(connectionId: string): Promise<Result<void, AppError>>;
  setUri(connectionId: string, uri: string): Promise<Result<void, AppError>>;
}

export const connectionKeychainService = "com.nexum.connection-uri";

export class KeychainConnectionSecretStore implements ConnectionSecretRepository {
  readonly #serviceName: string;

  constructor(serviceName = connectionKeychainService) {
    this.#serviceName = serviceName;
  }

  async getUri(connectionId: string): Promise<Result<string, AppError>> {
    try {
      const uri = await keytar.getPassword(this.#serviceName, connectionId);

      if (!uri) {
        return err(secretNotFoundError(connectionId));
      }

      return ok(uri);
    } catch (error) {
      return err(keychainError("read", connectionId, error));
    }
  }

  async removeUri(connectionId: string): Promise<Result<void, AppError>> {
    try {
      await keytar.deletePassword(this.#serviceName, connectionId);
      return ok(undefined);
    } catch (error) {
      return err(keychainError("delete", connectionId, error));
    }
  }

  async setUri(
    connectionId: string,
    uri: string,
  ): Promise<Result<void, AppError>> {
    try {
      await keytar.setPassword(this.#serviceName, connectionId, uri);
      return ok(undefined);
    } catch (error) {
      return err(keychainError("write", connectionId, error));
    }
  }
}

const secretNotFoundError = (connectionId: string): AppError =>
  new AppError("SECRET_NOT_FOUND", "Connection secret was not found", {
    details: { connectionId },
  });

const keychainError = (
  operation: "delete" | "read" | "write",
  connectionId: string,
  cause: unknown,
): AppError =>
  new AppError("UNKNOWN", `Unable to ${operation} connection secret`, {
    cause,
    details: { connectionId, operation },
  });
