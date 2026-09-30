import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="sticky top-[88px] z-10 -mx-4 mb-4 flex items-start justify-between gap-3 bg-cb-cream/95 px-4 py-3 backdrop-blur-sm lg:static lg:mx-0 lg:bg-transparent lg:px-0">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-cb-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-cb-muted-fg">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
