export type AppErrorCode =
  | "UNKNOWN"
  | "VALIDATION_FAILED"
  | "PLUGIN_NOT_FOUND"
  | "PLUGIN_ALREADY_REGISTERED"
  | "CONNECTION_NOT_FOUND"
  | "CONNECTION_ALREADY_EXISTS"
  | "SECRET_NOT_FOUND"
  | "UNAUTHORIZED"
  | "READ_ONLY_VIOLATION";

export type SerializedAppError = {
  code: AppErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    options: { details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    if (options.details) {
      this.details = options.details;
    }
    if (options.cause) {
      this.cause = options.cause;
    }
  }

  serialize(): SerializedAppError {
    return sanitizeError(this);
  }
}

const SECRET_KEY_PATTERN =
  /(?:password|passwd|pwd|secret|token|accessToken|refreshToken|uri|url|connectionString)/i;
const SECRET_VALUE_PATTERN =
  /(mongodb(?:\+srv)?:\/\/|postgres(?:ql)?:\/\/|mysql:\/\/|redis:\/\/|Bearer\s+)[^\s"']+/gi;

const redactString = (value: string): string =>
  value.replace(SECRET_VALUE_PATTERN, "$1[REDACTED]");

const sanitizeDetails = (
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined => {
  if (!details) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitizeUnknown(value),
    ]),
  );
};

const sanitizeUnknown = (value: unknown): unknown => {
  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item));
  }

  if (value && typeof value === "object") {
    return sanitizeDetails(value as Record<string, unknown>);
  }

  return value;
};

export const sanitizeError = (error: unknown): SerializedAppError => {
  if (error instanceof AppError) {
    const sanitized: SerializedAppError = {
      code: error.code,
      message: redactString(error.message),
    };
    const details = sanitizeDetails(error.details);

    if (details) {
      sanitized.details = details;
    }

    return sanitized;
  }

  if (error instanceof Error) {
    return {
      code: "UNKNOWN",
      message: redactString(error.message),
    };
  }

  return {
    code: "UNKNOWN",
    message: "Unknown error",
  };
};
