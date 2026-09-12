import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function ClosingBlurb() {
  return (
    <div className="container mx-auto px-4 py-10 flex flex-col items-center gap-3 text-center">
      <p className="max-w-md text-sm text-muted-foreground">
        Adorable, high-quality clothing for your little ones. Crafted with
        love, designed for comfort, and made to last.
      </p>
      <Link
        href="/about"
        className="inline-flex items-center gap-1 text-sm font-semibold text-cb-terracotta-deep hover:text-cb-terracotta"
      >
        Read our story
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
