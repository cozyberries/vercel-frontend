import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/header";
import Footer from "@/components/footer";
import MobileBottomHeader from "@/components/MobileBottomHeader";
import { ThemeProvider } from "@/components/theme-provider";
import { CartProvider } from "@/components/cart-context";
import { WishlistProvider } from "@/components/wishlist-context";
import { SupabaseAuthProvider } from "@/components/supabase-auth-provider";

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
      <body className={inter.className}>
        <SupabaseAuthProvider>
          <WishlistProvider>
            <CartProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="light"
                enableSystem={false}
                disableTransitionOnChange
              >
                <div className="flex min-h-screen flex-col">
                  <Header />
                  <main className="flex-1 pb-16 lg:pb-0">{children}</main>
                  <Footer />
                  <MobileBottomHeader />
                </div>
              </ThemeProvider>
            </CartProvider>
          </WishlistProvider>
        </SupabaseAuthProvider>
      </body>
    </html>
  );
}
