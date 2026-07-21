"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, Home, User, Search } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/supabase-auth-provider";
import type { LucideIcon } from "lucide-react";
import { useCart } from "@/components/cart-context";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  isActive: boolean;
  badge?: number | null;
}

export default function MobileBottomHeader() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { cart } = useCart();
  const cartTotalQuantity = cart.reduce((s, i) => s + (i.quantity || 0), 0);
  const navItems: NavItem[] = [
    {
      name: "Home",
      href: "/",
      icon: Home,
      isActive: pathname === "/",
    },
    {
      name: "Shop",
      href: "/products",
      icon: Search,
      isActive: pathname.startsWith("/products"),
    },
    {
      name: "Cart",
      href: "/cart",
      icon: ShoppingBag,
      isActive: pathname.startsWith("/cart"),
      badge: cartTotalQuantity > 0 ? cartTotalQuantity : null,
    },
    {
      name: "Account",
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
                  <div className="relative">
                    <Icon
                      className={`h-5 w-5 transition-colors duration-200 ${
                        item.isActive ? "text-cb-terracotta" : "text-gray-600"
                      }`}
                    />
                    {item.badge && (
                      <span className="absolute -top-1.5 -right-2.5 bg-cb-terracotta text-white rounded-full text-[10px] w-4 h-4 flex items-center justify-center font-medium">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-medium mt-0.5 transition-colors duration-200 ${
                      item.isActive ? "text-cb-terracotta" : "text-gray-600"
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
