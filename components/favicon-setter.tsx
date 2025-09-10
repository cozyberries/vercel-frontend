"use client";
import { useEffect } from "react";
import { getLogoUrl } from "@/lib/supabase";

export default function FaviconSetter() {
  useEffect(() => {
    async function setFavicon() {
      const logoUrl = await getLogoUrl();
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link") as HTMLLinkElement;
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = logoUrl;
    }
    setFavicon();
  }, []);
  return null;
} 