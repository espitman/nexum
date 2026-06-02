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

export const isOk = <TValue, TError>(
  result: Result<TValue, TError>,
): result is { ok: true; value: TValue } => result.ok;

export const isErr = <TValue, TError>(
  result: Result<TValue, TError>,
): result is { ok: false; error: TError } => !result.ok;

export const mapResult = <TValue, TError, TNextValue>(
  result: Result<TValue, TError>,
  mapper: (value: TValue) => TNextValue,
): Result<TNextValue, TError> =>
  result.ok ? ok(mapper(result.value)) : result;

export const unwrapOr = <TValue, TError>(
  result: Result<TValue, TError>,
  fallback: TValue,
): TValue => (result.ok ? result.value : fallback);
