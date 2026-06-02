export type Result<TValue, TError = Error> =
  | { ok: true; value: TValue }
  | { ok: false; error: TError };

export const ok = <TValue>(value: TValue): Result<TValue, never> => ({
  ok: true,
  value,
});

export const err = <TError>(error: TError): Result<never, TError> => ({
  ok: false,
  error,
});

export const createId = (prefix: string): string => {
  const random =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
};

export const nowIso = (): string => new Date().toISOString();
