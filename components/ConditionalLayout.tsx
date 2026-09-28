"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import Header from "@/components/header";
import Footer from "@/components/footer";

// Lazy-load MobileBottomHeader — it imports framer-motion (~130KB) which is
// not needed for initial page render / LCP. The bottom nav appears after
// the main content is interactive.
const MobileBottomHeader = dynamic(
  () => import("@/components/MobileBottomHeader"),
  { ssr: false }
);

interface ConditionalLayoutProps {
  children: React.ReactNode;
}

export default function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();

  // Sign-in/sign-up, the stall display, and admin print pages are standalone
  // full-screen pages — no site header/nav/footer. Admin print pages in
  // particular render a fixed-size @page for label printing; the site header
  // and fixed bottom nav would print alongside/over the label.
  if (
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/signup") ||
    pathname?.startsWith("/display") ||
    pathname?.startsWith("/admin/print")
  ) {
    return <>{children}</>;
  }

  // Regular pages get the full layout
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 pb-16 lg:pb-0">{children}</main>
      {/* <Footer /> */}
      <MobileBottomHeader />
    </div>
  );
}
