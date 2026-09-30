"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type AdminNotification } from "./api";

export default function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data } = useQuery<{ notifications: AdminNotification[]; unread: number }>({
    queryKey: ["admin", "notifications"],
    queryFn: () => api("/api/admin/notifications"),
    staleTime: 60_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "notifications"] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to mark read"),
  });

  const notifications = data?.notifications ?? [];
  const unread = data?.unread ?? 0;
  return (
    <section className="rounded-2xl border border-cb-border bg-cb-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-cb-fg"
      >
        <span>
          Delhivery scans
          {unread > 0 && (
            <span className="ml-2 rounded-full bg-cb-terracotta px-1.5 text-xs text-white">{unread}</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul className="max-h-72 space-y-1 overflow-y-auto border-t border-cb-border p-2">
          {notifications.length === 0 && <li className="p-2 text-xs text-cb-muted-fg">No shipment notifications.</li>}
          {notifications.map((n) => (
            <li key={n.id} className={`rounded-xl p-2 text-xs ${n.read ? "opacity-60" : "bg-cb-linen"}`}>
              <p className="font-medium">{n.title}</p>
              <p className="text-cb-muted-fg">{n.message}</p>
              {!n.read && (
                <button className="mt-1 underline" onClick={() => markRead.mutate(n.id)}>
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
