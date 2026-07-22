"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  SlidersHorizontal,
  CheckCheck,
  Truck,
  Percent,
  Sparkles,
  TrendingDown,
  Heart,
  Package,
  AlertTriangle,
  Bell,
  LogIn,
} from "lucide-react";
import { useAuth } from "@/components/supabase-auth-provider";
import { useNotifications, NOTIFICATIONS_QUERY_KEY } from "@/hooks/useApiQueries";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/services/api";
import type { AppNotification } from "@/lib/types/notification";
import { Button } from "@/components/ui/button";
import NotificationSettingsModal from "@/components/NotificationSettingsModal";

function getIcon(n: AppNotification) {
  const t = `${n.title} ${n.message}`.toLowerCase();
  if (t.includes("deliver") || t.includes("shipping") || t.includes("tracking") || t.includes("shipped")) {
    return { Icon: Truck, className: "bg-cb-peach text-cb-terracotta-deep" };
  }
  if (t.includes("off") || t.includes("discount") || t.includes("earlybird") || t.includes("sale")) {
    return { Icon: Percent, className: "bg-cb-peach text-cb-terracotta-deep" };
  }
  if (t.includes("back in stock")) {
    return { Icon: Sparkles, className: "bg-cb-linen text-cb-fg" };
  }
  if (t.includes("price drop")) {
    return { Icon: TrendingDown, className: "bg-cb-peach text-cb-terracotta-deep" };
  }
  if (t.includes("welcome") || t.includes("cozyberries")) {
    return { Icon: Heart, className: "bg-cb-linen text-cb-fg" };
  }
  if (t.includes("order") || t.includes("rating")) {
    return { Icon: Package, className: "bg-green-100 text-green-700" };
  }
  if (n.type === "error") {
    return { Icon: AlertTriangle, className: "bg-red-100 text-red-600" };
  }
  return { Icon: Bell, className: "bg-cb-linen text-cb-fg" };
}

function getBucket(createdAt: string): "today" | "this_week" | "earlier" {
  const created = new Date(createdAt);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (created >= startOfToday) return "today";
  const sevenDaysAgo = new Date(startOfToday);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  if (created >= sevenDaysAgo) return "this_week";
  return "earlier";
}

function formatTimestamp(createdAt: string, bucket: "today" | "this_week" | "earlier"): string {
  const created = new Date(createdAt);
  if (bucket === "today") {
    const diffMs = Date.now() - created.getTime();
    const diffMin = Math.max(0, Math.round(diffMs / 60000));
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    return `${diffHr}h ago`;
  }
  if (bucket === "this_week") {
    return created.toLocaleDateString("en-IN", { weekday: "short" });
  }
  return created.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const BUCKET_LABELS: Record<string, string> = {
  today: "Today",
  this_week: "This week",
  earlier: "Earlier",
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: notifications, isLoading } = useNotifications(user?.id);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const list = notifications ?? [];
  const unreadCount = list.filter((n) => !n.is_read).length;

  const grouped = useMemo(() => {
    const groups: Record<string, AppNotification[]> = { today: [], this_week: [], earlier: [] };
    for (const n of notifications ?? []) {
      groups[getBucket(n.created_at)].push(n);
    }
    return groups;
  }, [notifications]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [...NOTIFICATIONS_QUERY_KEY, user?.id] });

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      invalidate();
    } catch (err) {
      console.error("Failed to mark all notifications read:", err);
    }
  };

  const handleOpenNotification = async (n: AppNotification) => {
    if (n.is_read) return;
    try {
      await markNotificationRead(n.id);
      invalidate();
    } catch (err) {
      console.error("Failed to mark notification read:", err);
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/profile" aria-label="Back to profile" className="text-cb-fg">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold text-cb-fg">Notifications</h1>
        </div>
        <div className="rounded-2xl bg-cb-linen p-5 text-center">
          <p className="text-sm text-cb-muted-fg mb-4">Log in to see your notifications.</p>
          <Button asChild className="rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white gap-2">
            <Link href="/login?redirect=/notifications">
              <LogIn className="h-4 w-4" />
              Log in or sign up
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-lg px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link href="/profile" aria-label="Back to profile" className="text-cb-fg">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold text-cb-fg">Notifications</h1>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Notification settings"
          className="text-cb-fg"
        >
          <SlidersHorizontal className="h-5 w-5" />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 w-full bg-gray-100 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="w-12 h-12 mx-auto mb-4 bg-cb-linen rounded-full flex items-center justify-center">
            <Bell className="w-6 h-6 text-cb-muted-fg" />
          </div>
          <p className="text-cb-muted-fg font-medium text-sm">No notifications yet</p>
        </div>
      ) : (
        <>
          {unreadCount > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-cb-peach px-4 py-3 mb-4">
              <span className="text-sm font-semibold text-cb-terracotta-deep">
                {unreadCount} new notification{unreadCount === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1.5 text-sm font-semibold text-cb-terracotta-deep hover:underline"
              >
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </button>
            </div>
          )}

          {(["today", "this_week", "earlier"] as const).map((bucket) =>
            grouped[bucket].length > 0 ? (
              <div key={bucket} className="mb-2">
                <p className="text-xs font-bold uppercase tracking-wide text-cb-muted-fg mb-2 mt-4">
                  {BUCKET_LABELS[bucket]}
                </p>
                <div className="divide-y divide-cb-border">
                  {grouped[bucket].map((n) => {
                    const { Icon, className } = getIcon(n);
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => handleOpenNotification(n)}
                        className={`w-full flex items-start gap-3 py-3 text-left ${!n.is_read ? "bg-cb-linen/60 -mx-4 px-4 rounded-xl" : ""}`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${className}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-cb-fg">{n.title}</span>
                          <span className="block text-sm text-cb-muted-fg">{n.message}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
                          <span className="text-xs text-cb-muted-fg">{formatTimestamp(n.created_at, bucket)}</span>
                          {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-cb-terracotta" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null
          )}

          <p className="mt-6 text-center text-sm text-cb-muted-fg">You&apos;re all caught up 🌿</p>
        </>
      )}

      <NotificationSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
