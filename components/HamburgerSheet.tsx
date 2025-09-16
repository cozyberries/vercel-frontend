"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { images } from "@/app/assets/images";
import { useAuth } from "@/components/supabase-auth-provider";
import { usePreloadedData } from "@/components/data-preloader";

// Age ranges data
const ageRanges = [
  {
    id: "0-3m",
    name: "0-3 Months",
    slug: "0-3-months",
    description: "Newborn essentials",
    image: "/age/age_zero_three_m.png",
  },
  {
    id: "3-6m",
    name: "3-6 Months",
    slug: "3-6-months",
    description: "Growing baby comfort",
    image: "/age/age_three_six_m.png",
  },
  {
    id: "6-12m",
    name: "6-12 Months",
    slug: "6-12-months",
    description: "Active crawler styles",
    image: "/age/age_six_twelve_m.png",
  },
  {
    id: "1-2y",
    name: "1-2 Years",
    slug: "1-2-years",
    description: "Toddler adventures",
    image: "/age/age_one_two_y.png",
  },
  {
    id: "2-3y",
    name: "2-3 Years",
    slug: "2-3-years",
    description: "Independent explorer",
    image: "/age/age_two_three_y.png",
  },
  {
    id: "3-6y",
    name: "3-6 Years",
    slug: "3-6-years",
    description: "Little personality",
    image: "/age/age_three_six_y.png",
  },
];

export const HamburgerSheet = () => {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();
  const { categories, isLoading: categoriesLoading } = usePreloadedData();
  const [activeTab, setActiveTab] = useState<"categories" | "age">(
    "categories"
  );
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild className="lg:hidden">
        <Button variant="ghost" size="icon">
          <Menu className="h-6 w-6" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="border-b py-4">
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

          {/* Tabbed Navigation */}
          <div className="flex-1 py-6 overflow-y-auto">
            {/* Tab Headers */}
            <div className="flex border-b border-gray-200 mb-6">
              <button
                onClick={() => setActiveTab("categories")}
                className={`flex-1 px-4 py-3 text-base font-medium transition-colors ${
                  activeTab === "categories"
                    ? "text-primary border-b-2 border-primary"
                    : "text-foreground/60 hover:text-foreground"
                }`}
              >
                Categories
              </button>
              <button
                onClick={() => setActiveTab("age")}
                className={`flex-1 px-4 py-3 text-base font-medium transition-colors ${
                  activeTab === "age"
                    ? "text-primary border-b-2 border-primary"
                    : "text-foreground/60 hover:text-foreground"
                }`}
              >
                Shop by Age
              </button>
            </div>

            {/* Tab Content */}
            <div className="px-4">
              {activeTab === "categories" && (
                <div>
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
              )}

              {activeTab === "age" && (
                <div className="space-y-2">
                  {ageRanges.map((ageRange) => (
                    <Link
                      key={ageRange.id}
                      href={`/products?age=${ageRange.slug}`}
                      className="block px-3 py-3 hover:bg-gray-50 rounded-lg transition-colors"
                      onClick={() => setOpen(false)}
                    >
                      <div className="text-base font-medium text-foreground">
                        {ageRange.name}
                      </div>
                      <div className="text-sm text-foreground/60">
                        {ageRange.description}
                      </div>
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
