"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { images } from "@/app/assets/images";
import { useAuth } from "@/components/supabase-auth-provider";
import { usePreloadedData } from "@/components/data-preloader";

export const HamburgerSheet = () => {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();
  const { categories, isLoading: categoriesLoading } = usePreloadedData();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild className="lg:hidden">
        <button className="z-10 p-0">
          <Menu className="h-6 w-6" />
          <span className="sr-only">Open menu</span>
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80">
        <div className="flex flex-col h-full">
          {/* Header with Title */}
          <div className="border-b py-4">
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <Link
              href="/"
              className="flex items-center justify-center"
              onClick={() => setOpen(false)}
            >
              <Image
                src={images.logoURL}
                alt="CozyBerries"
                width={180}
                height={50}
                className="h-12 w-auto"
              />
            </Link>
          </div>

          {/* Categories Navigation */}
          <div className="flex-1 py-6 overflow-y-auto">
            <div className="px-4">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Categories
              </h3>
              {categoriesLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-10 bg-gray-200 animate-pulse rounded-lg"
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {categories.map((category) => (
                    <Link
                      key={category.id}
                      href={`/products?category=${category.slug}`}
                      className="block px-3 py-3 text-base font-medium text-foreground hover:text-primary hover:bg-gray-50 rounded-lg transition-colors"
                      onClick={() => setOpen(false)}
                    >
                      {category.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Links */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-foreground mb-4 px-4">
                Quick Links
              </h3>
              <div className="space-y-2 px-4">
                <Link
                  href="/products"
                  className="block px-3 py-2 text-base font-medium text-foreground/80 hover:text-primary transition-colors"
                  onClick={() => setOpen(false)}
                >
                  All Products
                </Link>
                {user && (
                  <Link
                    href="/orders"
                    className="block px-3 py-2 text-base font-medium text-foreground/80 hover:text-primary transition-colors"
                    onClick={() => setOpen(false)}
                  >
                    My Orders
                  </Link>
                )}
                <Link
                  href="/about"
                  className="block px-3 py-2 text-base font-medium text-foreground/80 hover:text-primary transition-colors"
                  onClick={() => setOpen(false)}
                >
                  About Us
                </Link>
              </div>
            </div>
          </div>

          {/* Auth Buttons */}
          <div className="border-t py-4">
            <div className="flex justify-center space-x-2">
              {!loading && (
                <>
                  {!user ? (
                    <Button asChild variant="ghost">
                      <Link href="/login" onClick={() => setOpen(false)}>
                        Login
                      </Link>
                    </Button>
                  ) : (
                    <>
                      <Button asChild variant="ghost">
                        <Link href="/profile" onClick={() => setOpen(false)}>
                          Profile
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          await signOut();
                          setOpen(false);
                          window.location.href = "/";
                        }}
                      >
                        Logout
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
