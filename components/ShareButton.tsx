"use client";

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function ShareButton() {
  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Product link copied to clipboard!");
    } catch (err) {
      console.log("Error copying to clipboard:", err);
      const textArea = document.createElement("textarea");
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      toast.success("Product link copied to clipboard!");
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-10 w-10 shrink-0"
      onClick={handleShare}
      aria-label="Share product"
    >
      <Share2 className="h-[18px] w-[18px]" />
    </Button>
  );
}
