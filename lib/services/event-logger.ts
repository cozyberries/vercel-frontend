import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side event logging — inserts directly into the event_logs table.
 * Used in API routes where we already have a Supabase client.
 */
export async function logServerEvent(
  supabase: SupabaseClient,
  userId: string,
  eventType: string,
  eventData?: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from("event_logs").insert({
      user_id: userId,
      event_type: eventType,
      event_data: eventData ?? null,
    });
  } catch (err) {
    // Fire-and-forget — never block the main flow for logging.
    console.error("Failed to log server event:", err);
  }
}

/**
 * Client-side event logging — calls POST /api/events.
 * Fire-and-forget: errors are silently caught so they never interrupt the UI.
 */
export function logEvent(
  eventType: string,
  eventData?: Record<string, unknown>,
  pagePath?: string
): void {
  try {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: eventType,
        event_data: eventData,
        page_path: pagePath ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
      }),
    }).catch(() => {
      // Silently ignore — logging must never disrupt the user experience.
    });
  } catch {
    // Ignore
  }
}
