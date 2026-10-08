"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const pdfUrl = (docId: string) => `/api/admin/retail/docs/${docId}/pdf`;

/** Download, or Share with the PDF attached (phone share sheet → Gmail). Falls back to a download. */
export function PdfButtons({ docId, fileName }: { docId: string; fileName: string }) {
  const share = async () => {
    try {
      const res = await fetch(pdfUrl(docId), { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error("pdf");
      const file = new File([await res.blob()], fileName, { type: "application/pdf" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        return;
      }
      const url = URL.createObjectURL(file);
      const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error("Couldn't share the PDF");
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline">
        <a href={pdfUrl(docId)} download={fileName}>Download PDF</a>
      </Button>
      <Button size="sm" variant="outline" onClick={() => void share()}>Share</Button>
    </div>
  );
}
