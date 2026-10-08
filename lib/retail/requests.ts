import { z } from "zod";
import { currentPeriod, firstOpenDay, isIsoDate, isPeriod, istToday } from "./dates";
import { validateGstin } from "./gstin";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const optionalText = (max: number) =>
  z.string().max(max).nullish().transform((v) => (v && v.trim() ? v.trim() : null));
const first = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid request";

const retailerSchema = z.object({
  legal_name: z.string({ required_error: "Enter the shop's legal name" }).trim().min(1, "Enter the shop's legal name").max(200),
  trade_name: optionalText(200),
  gstin: z.unknown(),
  address: z.string({ required_error: "Enter the shop's address" }).trim().min(1, "Enter the shop's address").max(500),
  contact_name: optionalText(100),
  phone: optionalText(20),
  email: optionalText(200).refine((v) => v === null || EMAIL.test(v), "Enter a valid email"),
  our_share_pct: z.number().gt(0, "Our share must be above 0%").lt(100, "Our share must be below 100%").multipleOf(0.01).default(75),
  active: z.boolean().default(true),
});

export type RetailerInput = Omit<z.infer<typeof retailerSchema>, "gstin"> & { gstin: string };

export function parseRetailer(body: unknown): Parsed<RetailerInput> {
  const parsed = retailerSchema.safeParse(body ?? {});
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  const gstin = validateGstin(parsed.data.gstin);
  if (!gstin.ok) return { ok: false, error: gstin.error };
  return { ok: true, value: { ...parsed.data, gstin: gstin.gstin } };
}

const quantity = z.number().int("Quantities must be whole pieces").min(0).max(10_000);
const slug = z.string().trim().min(1).max(200);

const docSaveSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("challan"),
    doc_id: z.string().nullish(),
    doc_date: z.string(),
    lines: z.array(z.object({ variant_slug: slug, quantity: quantity.min(1), mrp_paise: z.number().int().min(1).max(10_000_000) })).max(500),
  }),
  z.object({
    kind: z.literal("return"),
    doc_id: z.string().nullish(),
    doc_date: z.string(),
    lines: z.array(z.object({ variant_slug: slug, quantity })).max(500),
  }),
  z.object({
    kind: z.literal("sale"),
    period: z.string(),
    lines: z.array(z.object({ variant_slug: slug, quantity })).max(500),
  }),
]);

export type DocSave =
  | { kind: "challan"; doc_id: string | null; doc_date: string; lines: { variant_slug: string; quantity: number; mrp_paise: number }[] }
  | { kind: "return"; doc_id: string | null; doc_date: string; lines: { variant_slug: string; quantity: number }[] }
  | { kind: "sale"; period: string; lines: { variant_slug: string; quantity: number }[] };

export const CLOSED_MONTH_ERROR = "That month is closed for GST: use a date in an open month";

export function parseDocSave(body: unknown, now: Date): Parsed<DocSave> {
  const parsed = docSaveSchema.safeParse(body ?? {});
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  const v = parsed.data;
  if (v.kind === "sale") {
    if (!isPeriod(v.period) || v.period > currentPeriod(now)) return { ok: false, error: "Pick a month up to this one" };
    return { ok: true, value: { kind: "sale", period: v.period, lines: v.lines.filter((l) => l.quantity > 0) } };
  }
  const today = istToday(now);
  if (!isIsoDate(v.doc_date) || v.doc_date > today) return { ok: false, error: "The date can't be in the future" };
  if (v.doc_date < firstOpenDay(today)) return { ok: false, error: CLOSED_MONTH_ERROR };
  if (v.doc_id != null && !isUuid(v.doc_id)) return { ok: false, error: "Invalid request" };
  const lines = v.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "Add at least one item" };
  return v.kind === "challan"
    ? { ok: true, value: { kind: "challan", doc_id: v.doc_id ?? null, doc_date: v.doc_date, lines: lines as { variant_slug: string; quantity: number; mrp_paise: number }[] } }
    : { ok: true, value: { kind: "return", doc_id: v.doc_id ?? null, doc_date: v.doc_date, lines } };
}

export function parseDocAction(body: unknown): Parsed<{ action: "issue" | "cancel" }> {
  const parsed = z.object({ action: z.enum(["issue", "cancel"]) }).safeParse(body ?? {});
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "Unknown action" };
}

const paymentSchema = z.object({
  amount_paise: z.number().int().min(1, "Enter the amount received").max(1_000_000_000),
  paid_on: z.string(),
  method: z.enum(["upi", "bank", "cash"], { errorMap: () => ({ message: "Pick UPI, bank or cash" }) }),
  reference: optionalText(100),
  doc_id: z.string().nullish(),
});

export interface PaymentInput {
  amount_paise: number;
  paid_on: string;
  method: "upi" | "bank" | "cash";
  reference: string | null;
  doc_id: string | null;
}

export function parsePayment(body: unknown, now: Date): Parsed<PaymentInput> {
  const parsed = paymentSchema.safeParse(body ?? {});
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  const v = parsed.data;
  if (!isIsoDate(v.paid_on) || v.paid_on > istToday(now)) return { ok: false, error: "The date can't be in the future" };
  if (v.doc_id != null && !isUuid(v.doc_id)) return { ok: false, error: "Invalid request" };
  return { ok: true, value: { amount_paise: v.amount_paise, paid_on: v.paid_on, method: v.method, reference: v.reference, doc_id: v.doc_id ?? null } };
}
