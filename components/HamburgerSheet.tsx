"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { images } from "@/app/assets/images";
import { useAuth } from "@/components/supabase-auth-provider";
import { navigation } from "@/app/assets/data";

export const HamburgerSheet = () => {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();

  return (
    <Sheet>
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
            <Link href="/" className="flex items-center justify-center">
              <Image
                src={images.logoURL}
                alt="CozyBerries"
                width={180}
                height={50}
                className="h-12 w-auto"
              />
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-8">
            <ul className="space-y-6">
              {navigation.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`block px-4 py-2 text-base font-medium transition-colors ${
                        isActive
                          ? "text-primary"
                          : "text-foreground/80 hover:text-primary"
                      }`}
                    >
                      {item.name}
                    </Link>
                  </li>
                );
              })}

              {/* Profile */}
              <li>
                <Link
                  href="/profile"
                  aria-current={
                    pathname.startsWith("/profile") ? "page" : undefined
                  }
                  className={`block px-4 py-2 text-base font-medium transition-colors ${
                    pathname.startsWith("/profile")
                      ? "text-primary"
                      : "text-foreground/80 hover:text-primary"
                  }`}
                >
                  Profile
                </Link>
              </li>
            </ul>
          </nav>

          {/* Auth Buttons */}
          <div className="border-t py-4">
            <div className="flex justify-center space-x-2">
              {!loading && (
                <>
                  {!user ? (
                    <Button asChild variant="ghost">
                      <Link href="/login">Login</Link>
                    </Button>
                  ) : (
                    <>
                      <Button asChild variant="ghost">
                        <Link href="/profile">Profile</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          await signOut();
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
