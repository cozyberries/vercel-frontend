"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import Header from "@/components/header";
import Footer from "@/components/footer";
import AnnouncementBar from "@/components/announcement-bar";

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

  // Regular pages get the full layout
  return (
    <div className="flex min-h-screen flex-col">
      <AnnouncementBar />
      <Header />
      <main className="flex-1 pb-16 lg:pb-0">{children}</main>
      <Footer />
      <MobileBottomHeader />
    </div>
  );
}
