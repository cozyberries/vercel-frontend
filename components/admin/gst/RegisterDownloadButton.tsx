"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** The filename from a Content-Disposition header, if the server sent one. */
export function attachmentName(header: string | null): string | null {
  const match = header ? /filename="([^"]+)"/.exec(header) : null;
  return match ? match[1] : null;
}

/** Fetches the month's .xlsx and saves it; a failure shows a toast and leaves the page as it is. */
export function RegisterDownloadButton({ month, unfinished }: { month: string; unfinished: boolean }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sales-register/download?month=${month}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Couldn't download the register");
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = attachmentName(res.headers.get("Content-Disposition")) ?? `cozyberries-sales-register-${month}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking at once can cancel the save in Safari; a minute is plenty for the browser to take the file.
      // Global setTimeout (not window.setTimeout) so vitest's fake timers control it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't download the register");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" className="rounded-full" onClick={download} disabled={busy} aria-label="Download Excel">
        {busy ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Download className="mr-1.5 h-4 w-4" aria-hidden />
        )}
        Excel
      </Button>
      {unfinished && <p className="text-xs text-cb-muted-fg">Month not finished</p>}
    </div>
  );
}
