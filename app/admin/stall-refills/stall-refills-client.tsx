"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PackageCheck, PackageX, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  actionLabel,
  formatSaleDay,
  updatedAgo,
  type RefillAction,
  type RefillDay,
  type RefillLine,
  type RefillsResponse,
} from "@/lib/orders/stall-refills";

const QUERY_KEY = ["admin", "stall-refills"] as const;
const REFRESH_MS = 30_000;

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body?.error || "Request failed", res.status, body?.code);
  return body as T;
}

/** A signed-out or non-admin session: retrying or polling further is pointless until re-auth. */
function isAuthError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

interface TickInput {
  sale_date: string;
  variant_slug: string;
  action: RefillAction;
  quantity: number;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function leftClass(left: number): string {
  if (left === 0) return "font-semibold text-red-700";
  if (left === 1) return "font-semibold text-amber-700";
  return "";
}

export default function StallRefillsClient() {
  const queryClient = useQueryClient();
  const now = useNow(5_000);
  const [confirming, setConfirming] = useState<{ date: string; line: RefillLine } | null>(null);

  const query = useQuery<RefillsResponse, ApiError>({
    queryKey: QUERY_KEY,
    queryFn: () => api<RefillsResponse>("/api/admin/stall-refills"),
    // Signed out or not an admin any more: one more attempt won't succeed, so stop
    // retrying and stop polling instead of hammering the API every 30 s.
    retry: (failureCount, error) => !isAuthError(error) && failureCount < 1,
    retryDelay: 0,
    refetchInterval: (q) => (isAuthError(q.state.error) ? false : REFRESH_MS),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const refetchList = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  const onTickError = (err: unknown) => {
    if (err instanceof ApiError && err.status === 409) toast.error("Already handled on another phone");
    else if (err instanceof ApiError && err.code === "STALE_DATE") toast.error("This list is out of date");
    else toast.error(err instanceof Error ? err.message : "Could not save");
  };

  const tick = useMutation({
    mutationFn: (input: TickInput) =>
      api("/api/admin/stall-refills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onError: onTickError,
    onSettled: refetchList,
  });
  const undo = useMutation({
    mutationFn: (id: string) => api(`/api/admin/stall-refills/${id}`, { method: "DELETE" }),
    onError: onTickError,
    onSettled: refetchList,
  });
  const busy = tick.isPending || undo.isPending;

  const record = (date: string, line: RefillLine, action: RefillAction) => {
    if (!line.variant_slug) return;
    tick.mutate({ sale_date: date, variant_slug: line.variant_slug, action, quantity: line.pending });
  };

  if (query.isPending) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-cb-muted-fg" aria-label="Loading" />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="py-10 text-center">
        <p className="mb-3 text-sm text-cb-muted-fg">{query.error?.message ?? "Failed to load refills"}</p>
        <Button size="sm" variant="outline" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const data = query.data;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2 text-sm text-cb-muted-fg">
        <span>{updatedAgo(now - query.dataUpdatedAt)}</span>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Refresh"
          disabled={query.isFetching}
          onClick={() => query.refetch()}
        >
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {query.isError && isAuthError(query.error) ? (
        <div className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p>Signed out. Log in again to see refills.</p>
          <Button asChild size="sm" variant="outline" className="mt-2">
            <a href="/login?redirect=/admin/stall-refills">Log in again</a>
          </Button>
        </div>
      ) : (
        query.isError && (
          <p role="status" className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {"Couldn't refresh, retrying"}
          </p>
        )
      )}

      <DaySection
        title="Today"
        day={data.today}
        emptyText="Nothing sold yet today."
        busy={busy}
        onRecord={record}
        onConfirmNoStock={(date, line) => setConfirming({ date, line })}
        onUndo={(id) => undo.mutate(id)}
      />
      <DaySection
        title="Yesterday"
        day={data.yesterday}
        emptyText="Nothing sold yesterday."
        busy={busy}
        onRecord={record}
        onConfirmNoStock={(date, line) => setConfirming({ date, line })}
        onUndo={(id) => undo.mutate(id)}
      />

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming
                ? `Set ${confirming.line.name}${confirming.line.size ? ` ${confirming.line.size}` : ""} to 0?`
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>It will show as out of stock on the website.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming) record(confirming.date, confirming.line, "no_stock");
                setConfirming(null);
              }}
            >
              Set to 0
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface SectionProps {
  title: string;
  day: RefillDay;
  emptyText: string;
  busy: boolean;
  onRecord: (date: string, line: RefillLine, action: RefillAction) => void;
  onConfirmNoStock: (date: string, line: RefillLine) => void;
  onUndo: (id: string) => void;
}

function DaySection({ title, day, emptyText, busy, onRecord, onConfirmNoStock, onUndo }: SectionProps) {
  const open = day.lines.filter((line) => line.pending > 0).length;
  const done = day.lines.length - open;
  return (
    <section aria-label={title} className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-cb-fg">
          {title} · {formatSaleDay(day.date)}
        </h2>
        {day.lines.length > 0 && (
          <p className="text-sm text-cb-muted-fg">
            {open} to refill · {done} done
          </p>
        )}
      </div>
      {day.lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-cb-muted-fg">{emptyText}</p>
      ) : (
        <ul className="space-y-3">
          {day.lines.map((line) => (
            <LineItem
              key={line.key}
              line={line}
              busy={busy}
              onRecord={(action) => onRecord(day.date, line, action)}
              onConfirmNoStock={() => onConfirmNoStock(day.date, line)}
              onUndo={onUndo}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface LineProps {
  line: RefillLine;
  busy: boolean;
  onRecord: (action: RefillAction) => void;
  onConfirmNoStock: () => void;
  onUndo: (id: string) => void;
}

function LineItem({ line, busy, onRecord, onConfirmNoStock, onUndo }: LineProps) {
  const handled = line.pending === 0;
  return (
    <li
      data-testid={`refill-line-${line.key}`}
      className={`rounded-2xl border border-cb-border bg-white p-3 ${handled ? "opacity-60" : ""}`}
    >
      <div className="flex gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-cb-linen">
          {line.image && (
            <Image
              src={line.image}
              alt={line.name}
              width={48}
              height={48}
              unoptimized
              className="h-12 w-12 object-cover"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug text-cb-fg">{line.name}</p>
          <p className="text-sm text-cb-muted-fg">
            {line.size ?? "No size"} · Sold {line.sold}
            {line.stock_now !== null && (
              <>
                {" · "}
                <span className={leftClass(line.stock_now)}>Left {line.stock_now}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {line.variant_slug === null ? (
        <p className="mt-2 text-sm text-amber-800">Not linked to a stock item</p>
      ) : (
        <>
          {!handled && line.actions.length > 0 && (
            <p className="mt-2 text-sm font-medium text-cb-fg">{line.pending} more to refill</p>
          )}
          {line.actions.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-cb-muted-fg">
              {line.actions.map((action) => (
                <li key={action.id} className="flex items-center justify-between gap-2">
                  <span>{actionLabel(action)}</span>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => onUndo(action.id)}>
                    <Undo2 className="mr-1 h-4 w-4" />
                    Undo
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {!handled && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => onRecord("refilled")}>
                <PackageCheck className="mr-1.5 h-4 w-4" />
                Refilled
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={onConfirmNoStock}>
                <PackageX className="mr-1.5 h-4 w-4" />
                No stock left
              </Button>
            </div>
          )}
        </>
      )}
    </li>
  );
}
