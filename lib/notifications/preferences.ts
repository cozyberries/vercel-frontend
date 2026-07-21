export type NotificationCategory =
  | "order_updates"
  | "offers"
  | "back_in_stock"
  | "marketing";

export type NotificationPreferences = Record<NotificationCategory, boolean>;

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "order_updates",
  "offers",
  "back_in_stock",
  "marketing",
];

// Matches the design's default toggle states: everything on except marketing.
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  order_updates: true,
  offers: true,
  back_in_stock: true,
  marketing: false,
};

/**
 * user_metadata is schemaless and (per Supabase admin API) gets wholesale
 * replaced on update, not merged — so every reader must apply these defaults
 * on top of whatever partial object is actually stored.
 */
export function resolveNotificationPreferences(
  metadata: Record<string, unknown> | null | undefined
): NotificationPreferences {
  const stored = (metadata?.notification_preferences ?? {}) as Partial<NotificationPreferences>;
  const resolved = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  for (const key of NOTIFICATION_CATEGORIES) {
    if (typeof stored[key] === "boolean") resolved[key] = stored[key] as boolean;
  }
  return resolved;
}

export function isNotificationCategory(value: unknown): value is NotificationCategory {
  return typeof value === "string" && (NOTIFICATION_CATEGORIES as string[]).includes(value);
}
