"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, Heart, Package, Home, User } from "lucide-react";
import { motion } from "framer-motion";
import { useWishlist } from "@/components/wishlist-context";
import { useAuth } from "@/components/supabase-auth-provider";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  isActive: boolean;
  badge?: number | null;
}

export default function MobileBottomHeader() {
  const pathname = usePathname();
  const { wishlist } = useWishlist();
  const { user } = useAuth();

  const navItems: NavItem[] = [
    {
      name: "Home",
      href: "/",
      icon: Home,
      isActive: pathname === "/",
    },
    {
      name: "Products",
      href: "/products",
      icon: ShoppingBag,
      isActive: pathname.startsWith("/products"),
    },
    {
      name: "Wishlist",
      href: "/wishlist",
      icon: Heart,
      isActive: pathname.startsWith("/wishlist"),
      badge: wishlist.length > 0 ? wishlist.length : null,
    },
    ...(user
      ? [
          {
            name: "Orders",
            href: "/orders",
            icon: Package,
            isActive: pathname.startsWith("/orders"),
          },
        ]
      : []),
    {
      name: "Profile",
      href: user ? "/profile" : "/login",
      icon: User,
      isActive:
        pathname.startsWith("/profile") || pathname.startsWith("/login"),
    },
  ];

  return (
    <>
      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 z-40 lg:hidden">
        <div
          className={`grid h-16 ${navItems.length === 4 ? "grid-cols-4" : "grid-cols-5"}`}
        >
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className="outline-none"
              >
                <motion.div
                  className="relative flex flex-col items-center justify-center h-full"
                  whileTap={{ scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  {/* Animated active indicator pill */}
                  {item.isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-x-2 inset-y-1.5 bg-primary/10 rounded-xl"
                      transition={{
                        type: "spring",
                        stiffness: 350,
                        damping: 30,
                      }}
                    />
                  )}

                  <div className="relative z-10">
                    <Icon
                      className={`h-5 w-5 transition-colors duration-200 ${
                        item.isActive ? "text-primary" : "text-gray-400"
                      }`}
                    />
                    {item.badge && (
                      <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white rounded-full text-[10px] w-4 h-4 flex items-center justify-center font-medium">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-medium mt-0.5 relative z-10 transition-colors duration-200 ${
                      item.isActive ? "text-primary" : "text-gray-400"
                    }`}
                  >
                    {item.name}
                  </span>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom padding for content to avoid overlap */}
      <div className="h-16 lg:hidden" />
    </>
  );
}
