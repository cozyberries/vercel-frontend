import type { ReactNode } from "react";
import Link from "next/link";

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

export function StatTile({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  tone?: "default" | "attention";
}) {
  const attention = tone === "attention" && Number(value) > 0;
  const body = (
    <>
      <p className="text-xs font-medium text-cb-muted-fg">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${attention ? "text-cb-terracotta" : "text-cb-fg"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-cb-muted-fg">{hint}</p>}
    </>
  );
  const className = `block rounded-2xl border bg-cb-white p-4 ${
    attention ? "border-cb-terracotta/40" : "border-cb-border"
  }`;
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
