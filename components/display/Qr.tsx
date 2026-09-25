"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

interface QrProps {
  value: string;
  className?: string;
}

/** QR code rendered to inline SVG in the browser, so it keeps working offline. */
export default function Qr({ value, className = "" }: QrProps) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: "svg", margin: 1, color: { dark: "#4a3426", light: "#ffffff" } })
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      role="img"
      aria-label="QR code"
      data-qr-value={value}
      className={`aspect-square shrink-0 rounded-lg bg-white p-[0.6vmin] [&>svg]:h-full [&>svg]:w-full ${className}`}
      // Markup comes from the qrcode library for our own URL, never from user input.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
