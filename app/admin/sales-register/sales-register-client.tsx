"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import {
  EmptyState,
  ErrorBanner,
  FilterChips,
  ListCard,
  LoadingList,
  PageHeader,
  StatGrid,
  StatTile,
  type FilterChip,
} from "@/components/admin/kit";
import { SegmentBar } from "@/components/admin/charts/SegmentBar";
import { CHART_COLORS } from "@/components/admin/charts/chart-colors";
import { RegisterDownloadButton } from "@/components/admin/gst/RegisterDownloadButton";
import { RegisterTable } from "@/components/admin/gst/RegisterTable";
import { cancellationNote, formatIstDate, formatPaise } from "@/lib/gst/register-format";
import { availableMonths, defaultRegisterMonth, isUnfinishedMonth, monthLabel, parseRegisterMonth } from "@/lib/gst/register-month";
import { taxOf } from "@/lib/gst/register-summaries";
import type { RegisterInvoice, SalesRegister } from "@/lib/gst/register-types";

/** Seeds from ?month= so a refresh or a shared link keeps the month. Read in an effect: no useSearchParams. */
export function monthFromLocation(now: Date): string {
  if (typeof window === "undefined") return defaultRegisterMonth(now);
  return parseRegisterMonth(new URLSearchParams(window.location.search).get("month"), now) ?? defaultRegisterMonth(now);
}

function writeMonthToLocation(month: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("month", month);
  window.history.replaceState(window.history.state, "", url);
}

async function fetchRegister(month: string): Promise<SalesRegister> {
  const res = await fetch(`/api/admin/sales-register?month=${month}`, { credentials: "same-origin", cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || "Couldn't load the sales register"), { status: res.status });
  return body.register as SalesRegister;
}

export default function SalesRegisterClient() {
  const [now] = useState(() => new Date());
  const [month, setMonth] = useState<string | null>(null);

  useEffect(() => {
    setMonth(monthFromLocation(now));
  }, [now]);

  const query = useQuery({
    queryKey: ["admin", "sales-register", month],
    queryFn: () => fetchRegister(month as string),
    enabled: month !== null,
    staleTime: 30_000,
  });
  const register = query.data;
  const status = (query.error as { status?: number } | null)?.status;
  const chips: FilterChip<string>[] = availableMonths(now).map((m) => ({
    value: m,
    label: isUnfinishedMonth(m, now) ? `${monthLabel(m)} · so far` : monthLabel(m),
  }));

  const select = (next: string) => {
    setMonth(next);
    writeMonthToLocation(next);
  };

  return (
    <div>
      <PageHeader
        title="Sales register"
        subtitle={register ? `${register.period.from} to ${register.period.to}` : undefined}
        action={month ? <RegisterDownloadButton month={month} unfinished={isUnfinishedMonth(month, now)} /> : undefined}
      />
      {month && (
        <div className="mb-4">
          <FilterChips label="Month" chips={chips} value={month} onChange={select} />
        </div>
      )}
      {query.isError && (
        <ErrorBanner
          message={(query.error as Error).message}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          loginRedirect={status === 401 || status === 403 ? "/admin/sales-register" : undefined}
        />
      )}
      {register ? (
        <RegisterBody register={register} />
      ) : (
        !query.isError && <LoadingList rows={3} label="Loading the sales register" />
      )}
    </div>
  );
}

function RegisterBody({ register: r }: { register: SalesRegister }) {
  const t = r.totals;
  const empty = r.invoices.length === 0 && r.cancelledEarlier.length === 0;
  return (
    <div className="grid grid-cols-1 gap-3">
      {r.warnings.length > 0 && <Warnings warnings={r.warnings} />}
      {empty ? (
        <EmptyState title={`No invoices in ${monthLabel(r.month)}`} hint="The download still gives a nil register to file." />
      ) : (
        <>
          <StatGrid>
            <StatTile
              label="Invoice value"
              value={formatPaise(t.net.valuePaise)}
              hint={
                t.cancelledEarlier.valuePaise > 0
                  ? `after ${formatPaise(t.cancelledEarlier.valuePaise)} of earlier cancellations`
                  : "net for the month"
              }
            />
            <StatTile label="Net invoices" value={String(t.issued - t.cancelled)} hint={`${t.issued} issued · ${t.cancelled} cancelled`} />
            <StatTile label="Taxable value" value={formatPaise(t.net.taxablePaise)} />
            <StatTile
              label="Total tax"
              value={formatPaise(taxOf(t.net))}
              hint={`CGST ${formatPaise(t.net.cgstPaise)} · SGST ${formatPaise(t.net.sgstPaise)} · IGST ${formatPaise(t.net.igstPaise)}`}
            />
          </StatGrid>
          <SegmentBar
            label="Stall vs Online"
            parts={[
              { key: "stall", label: "Stall", value: t.byChannel.stall.valuePaise, color: CHART_COLORS.stall, valueLabel: formatPaise(t.byChannel.stall.valuePaise) },
              { key: "online", label: "Online", value: t.byChannel.online.valuePaise, color: CHART_COLORS.online, valueLabel: formatPaise(t.byChannel.online.valuePaise) },
            ]}
          />
          <RegisterTable
            title="By place of supply (B2CS)"
            columns={[
              { key: "pos", label: "Place of supply" },
              { key: "rate", label: "Rate", numeric: true },
              { key: "taxable", label: "Taxable", numeric: true },
              { key: "cgst", label: "CGST", numeric: true },
              { key: "sgst", label: "SGST", numeric: true },
              { key: "igst", label: "IGST", numeric: true },
            ]}
            rows={r.b2cs.map((row) => ({
              pos: row.placeOfSupply,
              rate: `${row.ratePercent}%`,
              taxable: formatPaise(row.net.taxablePaise),
              cgst: formatPaise(row.net.cgstPaise),
              sgst: formatPaise(row.net.sgstPaise),
              igst: formatPaise(row.net.igstPaise),
            }))}
          />
          {r.b2cl.length > 0 && (
            <RegisterTable
              title="Inter-state over ₹1,00,000 (B2CL)"
              columns={[
                { key: "number", label: "Invoice" },
                { key: "pos", label: "Place of supply" },
                { key: "value", label: "Value", numeric: true },
                { key: "igst", label: "IGST", numeric: true },
              ]}
              rows={r.b2cl.map((inv) => ({
                number: inv.invoiceNumber,
                pos: inv.placeOfSupply.code ? `${inv.placeOfSupply.code}-${inv.placeOfSupply.name}` : "—",
                value: formatPaise(inv.amounts.valuePaise),
                igst: formatPaise(inv.amounts.igstPaise),
              }))}
            />
          )}
          <RegisterTable
            title="HSN summary"
            columns={[
              { key: "hsn", label: "HSN" },
              { key: "qty", label: "Qty", numeric: true },
              { key: "taxable", label: "Taxable", numeric: true },
              { key: "tax", label: "Tax", numeric: true },
              { key: "value", label: "Value", numeric: true },
            ]}
            rows={r.hsn.map((row) => ({
              hsn: row.hsn,
              qty: String(row.quantity),
              taxable: formatPaise(row.net.taxablePaise),
              tax: formatPaise(taxOf(row.net)),
              value: formatPaise(row.net.valuePaise),
            }))}
          />
          <RegisterTable
            title="Invoice numbers used"
            columns={[
              { key: "from", label: "From" },
              { key: "to", label: "To" },
              { key: "total", label: "Issued", numeric: true },
              { key: "cancelled", label: "Cancelled", numeric: true },
            ]}
            rows={r.documents.map((run) => ({ from: run.from, to: run.to, total: String(run.total), cancelled: String(run.cancelled) }))}
          />
          <InvoiceList title="Invoices" invoices={r.invoices} />
          {r.cancelledEarlier.length > 0 && <InvoiceList title="Cancelled from earlier months" invoices={r.cancelledEarlier} earlier />}
        </>
      )}
    </div>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  return (
    <section aria-label="Warnings" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        Check before sending
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}

function invoiceDetail(inv: RegisterInvoice, earlier: boolean): string {
  if (earlier) {
    const when = inv.cancelledAt ? `Cancelled ${formatIstDate(inv.cancelledAt)}` : "Cancelled";
    return `${when} · less ${formatPaise(inv.amounts.valuePaise)}`;
  }
  if (inv.status === "cancelled") return cancellationNote(inv.cancelledAt, inv.amounts.valuePaise);
  return `${formatPaise(inv.amounts.valuePaise)} · tax ${formatPaise(taxOf(inv.amounts))}`;
}

function InvoiceList({ title, invoices, earlier = false }: { title: string; invoices: RegisterInvoice[]; earlier?: boolean }) {
  return (
    <section aria-label={title} className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold text-cb-fg">{title}</h3>
      <ul className="space-y-2">
        {invoices.map((inv) => (
          <ListCard
            key={inv.orderId}
            testId="register-invoice"
            title={inv.invoiceNumber}
            meta={`${formatIstDate(inv.invoiceDate)} · ${inv.customerName} · ${inv.channel === "stall" ? "Stall" : "Online"}`}
            dimmed={inv.status === "cancelled" && !earlier}
          >
            {invoiceDetail(inv, earlier)}
          </ListCard>
        ))}
      </ul>
    </section>
  );
}
