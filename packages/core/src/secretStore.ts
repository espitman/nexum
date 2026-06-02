import { AppError, err, ok, type Result } from "@nexum/shared";

export type SecretRef = {
  namespace: string;
  key: string;
};

export interface SecretStore {
  deleteSecret(ref: SecretRef): Promise<Result<void>>;
  getSecret(ref: SecretRef): Promise<Result<string>>;
  setSecret(ref: SecretRef, value: string): Promise<Result<void>>;
}

const serializeSecretRef = (ref: SecretRef): string =>
  `${ref.namespace}:${ref.key}`;

export class InMemorySecretStore implements SecretStore {
  readonly #secrets = new Map<string, string>();

  async deleteSecret(ref: SecretRef): Promise<Result<void>> {
    this.#secrets.delete(serializeSecretRef(ref));
    return ok(undefined);
  }

  async getSecret(ref: SecretRef): Promise<Result<string>> {
    const value = this.#secrets.get(serializeSecretRef(ref));

    if (value === undefined) {
      return err(
        new AppError("SECRET_NOT_FOUND", "Requested secret was not found", {
          details: { namespace: ref.namespace, key: ref.key },
        }),
      );
    }

    return ok(value);
  }

  async setSecret(ref: SecretRef, value: string): Promise<Result<void>> {
    this.#secrets.set(serializeSecretRef(ref), value);
    return ok(undefined);
  }
}
