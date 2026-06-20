export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem("v8_token");
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return fetch(url, { ...options, headers });
}
