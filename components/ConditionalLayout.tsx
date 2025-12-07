"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/header";
import Footer from "@/components/footer";
import MobileBottomHeader from "@/components/MobileBottomHeader";

interface ConditionalLayoutProps {
  children: React.ReactNode;
}

export default function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();

  // Regular pages get the full layout
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 pb-16 lg:pb-0">{children}</main>
      <Footer />
      <MobileBottomHeader />
    </div>
  );
}
