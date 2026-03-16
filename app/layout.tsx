import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ConditionalLayout from "@/components/ConditionalLayout";
import { ThemeProvider } from "@/components/theme-provider";
import { CartProvider } from "@/components/cart-context";
import { WishlistProvider } from "@/components/wishlist-context";
import { SupabaseAuthProvider } from "@/components/supabase-auth-provider";
import { DataPreloader } from "@/components/data-preloader";
import ScrollToTopButton from "@/components/ScrollToTopButton";
import PwaUpdateHandler from "@/components/PwaUpdateHandlerClient";
import { Toaster } from "sonner";
import { RatingProvider } from "@/components/rating-context";
import { QueryProvider } from "@/components/query-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CozyBerries | Premium Baby Clothing",
  description: "Adorable, high-quality clothing for your little ones",
  generator: "v0.dev",
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CozyBerries",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
        <meta name="theme-color" content="#ffffff" />
        <meta name="msapplication-TileColor" content="#ffffff" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      {/* suppressHydrationWarning on body helps when a browser extension (e.g. Cursor) injects data-cursor-ref into the DOM after server render */}
      <body className={inter.className} suppressHydrationWarning>
        <QueryProvider>
          <SupabaseAuthProvider>
            <DataPreloader>
              <WishlistProvider>
                <CartProvider>
                  <RatingProvider>
                  <ThemeProvider
                    attribute="class"
                    defaultTheme="light"
                    enableSystem={false}
                    disableTransitionOnChange
                  >
                    <ConditionalLayout>
                      {children}
                    </ConditionalLayout>
                    <PwaUpdateHandler />
                    <ScrollToTopButton />
                    <Toaster
                      closeButton
                      duration={2000}
                    />
                  </ThemeProvider>
                  </RatingProvider>
                </CartProvider>
              </WishlistProvider>
            </DataPreloader>
          </SupabaseAuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
