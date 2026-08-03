export type ApiErrorCode = string;

export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string[]>;
  };
};

export function apiError(
  code: ApiErrorCode,
  message: string,
  fields?: Record<string, string[]>,
): ApiError {
  return fields && Object.keys(fields).length > 0
    ? { error: { code, message, fields } }
    : { error: { code, message } };
}
