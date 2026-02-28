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
import { Toaster } from "sonner";
import { RatingProvider } from "@/components/rating-context";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CozyBerries | Premium Baby Clothing",
  description: "Adorable, high-quality clothing for your little ones",
  generator: "v0.dev",
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
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      {/* suppressHydrationWarning on body helps when a browser extension (e.g. Cursor) injects data-cursor-ref into the DOM after server render */}
      <body className={inter.className} suppressHydrationWarning>
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
                  <ScrollToTopButton />
                  <Toaster />
                </ThemeProvider>
                </RatingProvider>
              </CartProvider>
            </WishlistProvider>
          </DataPreloader>
        </SupabaseAuthProvider>
      </body>
    </html>
  );
}
