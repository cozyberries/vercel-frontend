"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, ListCard } from "@/components/admin/kit";
import { formatPaise } from "@/lib/gst/register-format";
import { monthLabel } from "@/lib/gst/register-month";
import type { RetailerDetail } from "@/lib/retail/api-types";
import { sendJson } from "@/lib/retail/client";
import { formatDay } from "@/lib/retail/dates";
import { docTotalPaise, mrpValueOf, piecesOf } from "@/lib/retail/pricing";
import type { ConsignmentDoc } from "@/lib/retail/types";
import { retailPdfFilename } from "@/lib/retail/documents";
import { PdfButtons } from "./PdfButtons";

const KIND = { challan: "Challan", sale: "Invoice", return: "Return" } as const;

function describe(d: ConsignmentDoc, share: number): string {
  if (d.kind === "sale") return `${monthLabel(d.period!)} · ${piecesOf(d)} pcs · ${formatPaise(docTotalPaise(d, share))}`;
  return `${piecesOf(d)} pcs · ${formatPaise(mrpValueOf(d))} at MRP`;
}

export function DocList({ detail, onChanged }: { detail: RetailerDetail; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const act = async (d: ConsignmentDoc, action: "issue" | "cancel") => {
    if (action === "cancel" && d.status === "issued" && !window.confirm(`Cancel ${d.number ?? "this document"}? This can't be undone.`)) return;
    setError(null);
    try {
      await sendJson(`/api/admin/retail/docs/${d.id}`, { action });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (detail.docs.length === 0) return <EmptyState title="No documents yet" />;
  return (
    <div className="grid gap-2">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <ul className="space-y-2">
        {detail.docs.map((d) => (
          <ListCard
            key={d.id}
            testId="retail-doc"
            title={d.number ?? (d.status === "draft" ? `Draft ${KIND[d.kind].toLowerCase()}` : "Nothing sold")}
            meta={`${KIND[d.kind]} · ${formatDay(d.doc_date)}`}
            status={d.status}
            dimmed={d.status === "cancelled"}
            actions={
              <div className="flex flex-wrap gap-2">
                {d.status !== "draft" && d.number && d.kind !== "return" && <PdfButtons docId={d.id} fileName={retailPdfFilename(d)} />}
                {d.status === "draft" && <Button size="sm" onClick={() => void act(d, "issue")}>Issue</Button>}
                {d.status !== "cancelled" && (
                  <Button size="sm" variant="ghost" onClick={() => void act(d, "cancel")}>{d.status === "draft" ? "Discard" : "Cancel"}</Button>
                )}
              </div>
            }
          >
            {describe(d, detail.retailer.our_share_pct)}
          </ListCard>
        ))}
      </ul>
    </div>
  );
}
