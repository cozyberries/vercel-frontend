import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "You're Offline | CozyBerries",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-background">
      <Image
        src="/logo/logo.png"
        alt="CozyBerries"
        width={120}
        height={120}
        className="mb-8 opacity-80"
        priority
      />
      <h1 className="text-2xl font-semibold text-foreground mb-3">
        You&apos;re offline
      </h1>
      <p className="text-muted-foreground mb-2 max-w-xs">
        It looks like you&apos;ve lost your internet connection.
      </p>
      <p className="text-muted-foreground mb-8 max-w-xs text-sm">
        Your cart is saved. Browse your previously visited pages or come back
        when you&apos;re connected.
      </p>
      <Link
        href="/"
        className="inline-flex items-center px-6 py-3 rounded-md bg-primary text-primary-foreground text-sm font-medium"
      >
        Go to Homepage
      </Link>
    </div>
  );
}
