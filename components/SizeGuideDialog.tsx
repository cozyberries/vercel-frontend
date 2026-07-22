"use client";

import { X } from "lucide-react";

interface SizeGuideDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const SIZE_ROWS = [
  { size: "0–3 m", weight: "3–6 kg", height: "50–60 cm" },
  { size: "3–6 m", weight: "6–8 kg", height: "60–67 cm" },
  { size: "6–12 m", weight: "8–10 kg", height: "67–76 cm" },
  { size: "1–2 y", weight: "10–13 kg", height: "76–88 cm" },
  { size: "2–3 y", weight: "13–15 kg", height: "88–98 cm" },
  { size: "3–6 y", weight: "15–20 kg", height: "98–116 cm" },
];

export default function SizeGuideDialog({ isOpen, onClose }: SizeGuideDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center md:p-4 z-50">
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 shrink-0">
          <h3 className="text-lg font-bold text-cb-fg">Size guide</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-cb-fg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <p className="text-sm text-cb-muted-fg mb-4">
            Find the right fit by your baby&apos;s age, weight, and height. When in between, size up — there&apos;s room to grow.
          </p>

          <div className="rounded-2xl border border-cb-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cb-linen">
                  <th className="px-4 py-3 text-left font-bold text-cb-fg">Size</th>
                  <th className="px-4 py-3 text-left font-bold text-cb-fg">Weight</th>
                  <th className="px-4 py-3 text-left font-bold text-cb-fg">Height</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cb-border">
                {SIZE_ROWS.map((row) => (
                  <tr key={row.size}>
                    <td className="px-4 py-3 font-bold text-cb-fg">{row.size}</td>
                    <td className="px-4 py-3 text-cb-muted-fg">{row.weight}</td>
                    <td className="px-4 py-3 text-cb-muted-fg">{row.height}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
