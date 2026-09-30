"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageCheck, PackageX, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SegmentedTabs, ListCard, EmptyState, LoadingList, ErrorBanner, ActionSheet } from "@/components/admin/kit";
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
  const [day, setDay] = useState<"today" | "yesterday">("today");

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

  if (query.isPending) return <LoadingList label="Loading" />;
  if (!query.data) {
    return (
      <ErrorBanner
        message={query.error?.message ?? "Failed to load refills"}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        loginRedirect={isAuthError(query.error) ? "/admin/stall-refills" : undefined}
      />
    );
  }

  const data = query.data;
  const openCount = (d: RefillDay) => d.lines.filter((l) => l.pending > 0).length;
  const current = day === "today" ? data.today : data.yesterday;
  const title = day === "today" ? "Today" : "Yesterday";
  const emptyText = day === "today" ? "Nothing sold yet today." : "Nothing sold yesterday.";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2 text-sm text-cb-muted-fg">
        <span>{updatedAgo(now - query.dataUpdatedAt)}</span>
        <Button size="sm" variant="ghost" aria-label="Refresh" disabled={query.isFetching} onClick={() => query.refetch()}>
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {query.isError && isAuthError(query.error) ? (
        <ErrorBanner message="Signed out. Log in again to see refills." loginRedirect="/admin/stall-refills" />
      ) : (
        query.isError && <ErrorBanner message="Couldn't refresh, retrying" />
      )}

      <div className="mb-4">
        <SegmentedTabs
          label="Day"
          tabs={[
            { key: "today", label: "Today", count: openCount(data.today) },
            { key: "yesterday", label: "Yesterday", count: openCount(data.yesterday) },
          ]}
          value={day}
          onChange={setDay}
        />
      </div>

      <DaySection
        title={title}
        day={current}
        emptyText={emptyText}
        busy={busy}
        onRecord={record}
        onConfirmNoStock={(date, line) => setConfirming({ date, line })}
        onUndo={(id) => undo.mutate(id)}
      />

      <ActionSheet
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirming ? `Set ${confirming.line.name}${confirming.line.size ? ` ${confirming.line.size}` : ""} to 0?` : ""}
        description="It will show as out of stock on the website."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="rounded-full sm:flex-1" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
          <Button
            className="rounded-full sm:flex-1"
            onClick={() => {
              if (confirming) record(confirming.date, confirming.line, "no_stock");
              setConfirming(null);
            }}
          >
            Set to 0
          </Button>
        </div>
      </ActionSheet>
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
    <section aria-label={title}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-cb-fg">
          {title} · {formatSaleDay(day.date)}
        </h2>
        {day.lines.length > 0 && (
          <p className="text-sm text-cb-muted-fg">
            {open} to refill · {done} done
          </p>
        )}
      </div>
      {day.lines.length === 0 ? (
        <EmptyState title={emptyText} />
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
  const unlinked = line.variant_slug === null;
  return (
    <ListCard
      testId={`refill-line-${line.key}`}
      dimmed={handled}
      title={
        <span className="flex gap-3">
          <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-cb-linen">
            {line.image && (
              <Image src={line.image} alt={line.name} width={48} height={48} unoptimized className="h-12 w-12 object-cover" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold leading-snug text-cb-fg">{line.name}</span>
            <span className="block text-sm font-normal text-cb-muted-fg">
              {line.size ?? "No size"} · Sold {line.sold}
              {line.stock_now !== null && (
                <>
                  {" · "}
                  <span className={leftClass(line.stock_now)}>Left {line.stock_now}</span>
                </>
              )}
            </span>
          </span>
        </span>
      }
      actions={
        !unlinked && !handled ? (
          <>
            <Button className="rounded-full" disabled={busy} onClick={() => onRecord("refilled")}>
              <PackageCheck className="mr-1.5 h-4 w-4" aria-hidden />
              Refilled
            </Button>
            <Button variant="outline" className="rounded-full" disabled={busy} onClick={onConfirmNoStock}>
              <PackageX className="mr-1.5 h-4 w-4" aria-hidden />
              No stock left
            </Button>
          </>
        ) : undefined
      }
    >
      {unlinked ? (
        <p className="text-amber-800">Not linked to a stock item</p>
      ) : (
        <>
          {!handled && line.actions.length > 0 && <p className="font-medium">{line.pending} more to refill</p>}
          {line.actions.length > 0 && (
            <ul className="mt-1 space-y-1 text-cb-muted-fg">
              {line.actions.map((action) => (
                <li key={action.id} className="flex items-center justify-between gap-2">
                  <span>{actionLabel(action)}</span>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => onUndo(action.id)}>
                    <Undo2 className="mr-1 h-4 w-4" aria-hidden />
                    Undo
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </ListCard>
  );
}
