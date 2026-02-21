// API response envelope types

export interface ApiResponse<T> {
  ok: true;
  data: T;
  meta: {
    timestamp: string;
    request_id: string;
  };
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
  meta: {
    timestamp: string;
    request_id: string;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;
