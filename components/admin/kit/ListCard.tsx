"use client";
import type { ReactNode } from "react";
import { StatusPill } from "./StatusPill";

export function ListCard({
  title,
  meta,
  status,
  children,
  actions,
  onClick,
  testId,
  dimmed = false,
}: {
  title: ReactNode;
  meta?: ReactNode;
  status?: string;
  children?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
  testId?: string;
  dimmed?: boolean;
}) {
  const head = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-semibold leading-snug text-cb-fg">{title}</p>
        {status && <StatusPill status={status} />}
      </div>
      {meta && <p className="mt-0.5 text-sm text-cb-muted-fg">{meta}</p>}
    </>
  );
  return (
    <li
      data-testid={testId}
      className={`list-none rounded-2xl border border-cb-border bg-cb-white p-4 ${dimmed ? "opacity-60" : ""}`}
    >
      {onClick ? (
        <button type="button" onClick={onClick} className="block w-full text-left">
          {head}
        </button>
      ) : (
        head
      )}
      {children && <div className="mt-2 text-sm text-cb-fg">{children}</div>}
      {actions && <div className="mt-3 flex flex-col gap-2 sm:flex-row [&>*]:w-full sm:[&>*]:flex-1">{actions}</div>}
    </li>
  );
}
