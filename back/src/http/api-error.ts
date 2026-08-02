export type ApiErrorCode = "INVALID_REQUEST" | "NOT_FOUND";

export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string[]>;
  };
};

export function apiError(code: ApiErrorCode, message: string): ApiError {
  return { error: { code, message } };
}
