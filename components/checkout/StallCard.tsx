import { Clock, MapPin, Store } from "lucide-react";
import { STALL } from "@/lib/config/business";

export function StallCard({ title = "Pick up from" }: { title?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-cb-border p-5" data-testid="stall-card">
      <p className="flex items-center gap-2 text-base font-bold text-cb-fg mb-3">
        <Store className="h-4 w-4 text-cb-terracotta-deep" />
        {title}
      </p>
      <p className="text-sm font-bold text-cb-fg">{STALL.name}</p>
      {STALL.addressLines.map((line) => (
        <p key={line} className="text-sm text-cb-muted-fg">
          {line}
        </p>
      ))}
      <p className="flex items-center gap-1.5 text-sm text-cb-muted-fg mt-2">
        <Clock className="h-3.5 w-3.5" />
        {STALL.hours}
      </p>
      <a
        href={STALL.mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-cb-terracotta-deep"
      >
        <MapPin className="h-3.5 w-3.5" />
        Open in Maps
      </a>
    </div>
  );
}
