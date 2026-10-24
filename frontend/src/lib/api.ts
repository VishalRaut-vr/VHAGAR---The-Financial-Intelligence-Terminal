const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError'; }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError('VHAGAR API is unreachable. Check that the backend is running.', 0);
  }
  const body = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new ApiError(body.message ?? `Request failed (${response.status})`, response.status);
  return body as T;
}
