import { apiUrl } from './config';
import { ApiError } from './errors';

type ApiEnvelope = {
  ok?: boolean;
  message?: string;
  code?: string;
};

type RequestOptions = Omit<RequestInit, 'headers'> & {
  token?: string | null;
  headers?: HeadersInit;
};

export async function apiRequest<T = unknown>(
  path: string,
  { token, headers, ...init }: RequestOptions = {},
): Promise<T> {
  const requestHeaders = new Headers(headers);
  if (token) requestHeaders.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const response = await fetch(apiUrl(path), { ...init, headers: requestHeaders });
  const contentType = response.headers.get('content-type') || '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  const envelope = payload && typeof payload === 'object' ? payload as ApiEnvelope : undefined;

  if (!response.ok || envelope?.ok === false) {
    throw new ApiError(
      envelope?.message || `请求失败（${response.status}）`,
      response.status,
      envelope?.code,
    );
  }

  return payload as T;
}

export async function apiBlob(
  path: string,
  { token, headers, ...init }: RequestOptions = {},
): Promise<Blob> {
  const requestHeaders = new Headers(headers);
  if (token) requestHeaders.set('Authorization', `Bearer ${token}`);

  const response = await fetch(apiUrl(path), { ...init, headers: requestHeaders });
  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    if ((response.headers.get('content-type') || '').includes('application/json')) {
      const payload = await response.json() as ApiEnvelope;
      if (payload.message) message = payload.message;
    }
    throw new ApiError(message, response.status);
  }
  return response.blob();
}
