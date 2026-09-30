import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-cb-border bg-cb-white/60 px-4 py-10 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-cb-linen text-cb-muted-fg">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden />}
      </div>
      <p className="text-sm font-semibold text-cb-fg">{title}</p>
      {hint && <p className="mt-1 text-sm text-cb-muted-fg">{hint}</p>}
    </div>
  );
}
