/** Browser helpers for /api/admin/retail/*. Errors carry the API's message and status. */
export async function retailFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || "Something went wrong"), { status: res.status, body });
  return body as T;
}

export function sendJson<T>(url: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<T> {
  return retailFetch<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
