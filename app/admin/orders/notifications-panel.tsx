"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

  const unread = data?.unread ?? 0;
  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
        Scans{unread > 0 ? ` (${unread})` : ""}
      </Button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-80 rounded-md border bg-background p-2 shadow-md">
          {(data?.notifications ?? []).length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">No shipment notifications.</p>
          )}
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {(data?.notifications ?? []).map((n) => (
              <li key={n.id} className={`rounded p-2 text-xs ${n.read ? "opacity-60" : "bg-accent"}`}>
                <p className="font-medium">{n.title}</p>
                <p className="text-muted-foreground">{n.message}</p>
                {!n.read && (
                  <button className="mt-1 underline" onClick={() => markRead.mutate(n.id)}>
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
