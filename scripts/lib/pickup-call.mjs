// The one Delhivery call shared by scripts/request-pickup.mjs and scripts/manifest-shipment.mjs
// --pickup: POST /fm/request/new/ with the token from .env.local. Returns the raw status and
// body for lib/delhivery/pickup.ts interpretPickupResponse().
export async function postPickupRequest({ baseUrl, token, payload, timeoutMs = 15_000 }) {
  const res = await fetch(`${baseUrl}/fm/request/new/`, {
    method: "POST",
    headers: { Authorization: `Token ${token}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: res.status, text: await res.text() };
}
