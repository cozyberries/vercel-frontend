"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ActionSheet, ErrorBanner, LoadingList, PageHeader, SegmentedTabs, StatGrid, StatTile } from "@/components/admin/kit";
import { DocList, HoldingsList, PaymentsPanel, RetailerForm, SalesPanel, SendStockSheet, TakeBackSheet } from "@/components/admin/retail";
import { gstStateName } from "@/lib/invoice/state-codes";
import { formatPaise } from "@/lib/gst/register-format";
import type { RetailerDetail } from "@/lib/retail/api-types";
import { retailFetch, sendJson } from "@/lib/retail/client";
import { formatDay } from "@/lib/retail/dates";
import { RETAIL_KEY } from "../retail-client";

type Tab = "stock" | "sales" | "documents" | "payments";
type Sheet = "send" | "back" | "edit" | null;

export default function RetailerClient({ id }: { id: string }) {
  const qc = useQueryClient();
  const key = [...RETAIL_KEY, id];
  const query = useQuery({ queryKey: key, queryFn: () => retailFetch<{ detail: RetailerDetail }>(`/api/admin/retail/${id}`).then((b) => b.detail), staleTime: 15_000 });
  const [tab, setTab] = useState<Tab>("stock");
  const [sheet, setSheet] = useState<Sheet>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: RETAIL_KEY });
  const d = query.data;
  const status = (query.error as { status?: number } | null)?.status;

  if (!d) {
    return query.isError ? (
      <ErrorBanner message={(query.error as Error).message} onRetry={() => void query.refetch()} retrying={query.isFetching}
        loginRedirect={status === 401 || status === 403 ? `/admin/retail/${id}` : undefined} />
    ) : <LoadingList rows={3} label="Loading the shop" />;
  }

  const r = d.retailer;
  const s = d.summary;
  return (
    <div className="grid gap-3">
      <PageHeader
        title={r.trade_name || r.legal_name}
        subtitle={`${r.gstin} · ${gstStateName(r.state_code) ?? r.state_code} · ${r.our_share_pct}% ours`}
        action={<Button size="sm" variant="outline" onClick={() => setSheet("edit")}>Edit</Button>}
      />
      {r.email && <p className="-mt-2 text-sm text-cb-muted-fg">Invoices to {r.email}</p>}
      <StatGrid>
        <StatTile label="Pieces held" value={String(s.unitsHeld)} />
        <StatTile label="Value at MRP" value={formatPaise(s.mrpValueHeldPaise)} />
        <StatTile label="Owed" value={formatPaise(s.owedPaise)} tone={s.owedPaise > 0 ? "attention" : "default"} />
        <StatTile label="Oldest batch" value={s.oldestSentOn ? formatDay(s.oldestSentOn) : "—"}
          hint={s.redBatches ? `${s.redBatches} past 6 months` : s.amberBatches ? `${s.amberBatches} over 5 months` : undefined}
          tone={s.redBatches ? "attention" : "default"} />
      </StatGrid>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!r.active} onClick={() => setSheet("send")}>Send stock</Button>
        <Button size="sm" variant="outline" disabled={d.holdings.length === 0} onClick={() => setSheet("back")}>Take back</Button>
      </div>
      <SegmentedTabs<Tab>
        label="Shop sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "stock", label: "Stock", count: s.unitsHeld },
          { key: "sales", label: "Monthly sales" },
          { key: "documents", label: "Documents", count: d.docs.length },
          { key: "payments", label: "Payments" },
        ]}
      />
      {tab === "stock" && <HoldingsList holdings={d.holdings} />}
      {tab === "sales" && <SalesPanel detail={d} onChanged={refresh} />}
      {tab === "documents" && <DocList detail={d} onChanged={refresh} />}
      {tab === "payments" && <PaymentsPanel detail={d} onChanged={refresh} />}

      <SendStockSheet retailerId={r.id} today={d.today} open={sheet === "send"} onOpenChange={(o) => setSheet(o ? "send" : null)} onDone={refresh} />
      <TakeBackSheet detail={d} open={sheet === "back"} onOpenChange={(o) => setSheet(o ? "back" : null)} onDone={refresh} />
      <ActionSheet open={sheet === "edit"} onOpenChange={(o) => setSheet(o ? "edit" : null)} title="Edit shop">
        <RetailerForm initial={r} submitLabel="Save" onSubmit={async (body) => { await sendJson(`/api/admin/retail/${r.id}`, body, "PATCH"); setSheet(null); refresh(); }} />
      </ActionSheet>
    </div>
  );
}
