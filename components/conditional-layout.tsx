"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import Header from "@/components/header";
import Footer from "@/components/footer";
import MobileBottomHeader from "@/components/MobileBottomHeader";

interface ConditionalLayoutProps {
  children: ReactNode;
}

export function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();
  
  // Check if we're on the home page (under construction)
  const isUnderConstruction = pathname === "/";

  if (isUnderConstruction) {
    // For under construction page, return only the children without header/footer
    return <>{children}</>;
  }

  // For all other pages, return the full layout with header and footer
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 pb-16 lg:pb-0">{children}</main>
      <Footer />
      <MobileBottomHeader />
    </div>
  );
}
