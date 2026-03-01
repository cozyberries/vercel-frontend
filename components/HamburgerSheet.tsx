"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu, ChevronRight, Home, Mail, Instagram } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { getAgeOptions, type AgeOptionFilter } from "@/lib/services/api";

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
};

const dropdownVariants = {
  hidden: {
    height: 0,
    opacity: 0,
  },
  visible: {
    height: "auto",
    opacity: 1,
  },
};

export const HamburgerSheet = () => {
  const pathname = usePathname();
  const { user, loading, signOut, isAdmin } = useAuth();
  const { categories, isLoading: categoriesLoading } = usePreloadedData();
  const [open, setOpen] = useState(false);
  const [expandedDropdowns, setExpandedDropdowns] = useState<string[]>([]);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [ageOptions, setAgeOptions] = useState<AgeOptionFilter[]>([]);
  const [ageOptionsError, setAgeOptionsError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getAgeOptions()
      .then((options) => {
        if (mounted) {
          setAgeOptions(options);
          setAgeOptionsError(null);
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error("Failed to load age options:", err);
          setAgeOptions([]);
          setAgeOptionsError("Unable to load age options");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const toggleDropdown = (dropdown: string) => {
    setExpandedDropdowns((prev) =>
      prev.includes(dropdown)
        ? prev.filter((item) => item !== dropdown)
        : [...prev, dropdown]
    );
  };

  const MenuItem = ({
    href,
    children,
    onClick,
    className = "",
  }: {
    href?: string;
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => {
    const content = (
      <motion.div
        variants={itemVariants}
        className={`flex items-center justify-between px-3 py-3 text-base font-medium text-foreground hover:text-primary hover:bg-gray-50 rounded-lg transition-colors cursor-pointer ${className}`}
        onClick={onClick}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {children}
      </motion.div>
    );

    if (href) {
      return (
        <Link href={href} onClick={() => setOpen(false)}>
          {content}
        </Link>
      );
    }

    return content;
  };

  const DropdownItem = ({
    href,
    children,
    onClick,
  }: {
    href?: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => {
    const content = (
      <motion.div
        variants={itemVariants}
        className="flex items-center px-6 py-2 text-sm text-foreground/80 hover:text-primary hover:bg-gray-50 transition-colors cursor-pointer"
        whileHover={{ x: 4 }}
        whileTap={{ scale: 0.98 }}
      >
        {children}
      </motion.div>
    );

    if (href) {
      return (
        <Link href={href} onClick={() => setOpen(false)}>
          {content}
        </Link>
      );
    }

    return content;
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild className="lg:hidden">
        <button className="z-10 p-0">
          <Menu className="h-6 w-6" />
          <span className="sr-only">Open menu</span>
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(85vw,320px)]">
        <div className="flex flex-col h-full">
          {/* Header with Logo */}
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

          {/* Navigation Menu */}
          <div className="flex-1 py-6 overflow-y-auto">
            <motion.div className="space-y-1">
              {/* Home Button */}
              <MenuItem href="/">
                <div className="flex items-center">
                  <Home className="h-4 w-4 mr-2" />
                  Home
                </div>
              </MenuItem>

              {/* Shop by Age Dropdown */}
              <div>
                <MenuItem onClick={() => toggleDropdown("shop-by-age")}>
                  <div className="flex items-center">Shop by Age</div>
                  <motion.div
                    animate={{
                      rotate: expandedDropdowns.includes("shop-by-age")
                        ? 90
                        : 0,
                    }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </motion.div>
                </MenuItem>
                <AnimatePresence>
                  {expandedDropdowns.includes("shop-by-age") && (
                    <motion.div
                      variants={dropdownVariants}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="ml-2 overflow-hidden"
                    >
                      {ageOptionsError ? (
                        <p className="px-6 py-2 text-sm text-muted-foreground">
                          {ageOptionsError}
                        </p>
                      ) : (
                        ageOptions.map((age) => (
                          <DropdownItem
                            key={age.id}
                            href={`/products?age=${encodeURIComponent(age.slug)}`}
                          >
                            {age.name}
                          </DropdownItem>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Shop by Category Dropdown (from DB) */}
              <div>
                <MenuItem onClick={() => toggleDropdown("shop-by-category")}>
                  <div className="flex items-center">Shop by Category</div>
                  <motion.div
                    animate={{
                      rotate: expandedDropdowns.includes("shop-by-category")
                        ? 90
                        : 0,
                    }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </motion.div>
                </MenuItem>
                <AnimatePresence>
                  {expandedDropdowns.includes("shop-by-category") && (
                    <motion.div
                      variants={dropdownVariants}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="ml-2 overflow-hidden"
                    >
                      {categoriesLoading ? (
                        <p className="px-6 py-2 text-sm text-muted-foreground">
                          Loading…
                        </p>
                      ) : categories.length === 0 ? (
                        <p className="px-6 py-2 text-sm text-muted-foreground">
                          No categories
                        </p>
                      ) : (
                        categories
                          .filter((c) => c.display === true)
                          .map((cat) => (
                            <DropdownItem
                              key={cat.id}
                              href={`/products?category=${encodeURIComponent(cat.slug ?? "")}`}
                            >
                              {cat.name}
                            </DropdownItem>
                          ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Gender links (no sub-items; category list is above) */}
              <MenuItem href="/products?gender=girl">
                <div className="flex items-center">Girls Clothing</div>
              </MenuItem>
              <MenuItem href="/products?gender=boy">
                <div className="flex items-center">Boys Clothing</div>
              </MenuItem>
              <MenuItem href="/products?gender=unisex">
                <div className="flex items-center">Unisex</div>
              </MenuItem>

              {/* Need Help Section */}
              <motion.div
                className="mt-6 pt-4 border-t border-gray-200"
                variants={itemVariants}
              >
                <div className="px-3 py-2 text-sm font-semibold text-foreground mb-3">
                  Need Help?
                </div>

                <div className="space-y-2">
                  <motion.a
                    href="https://wa.me/+917411431101"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-3 py-2 text-sm text-[#7a7b5f] hover:text-primary transition-colors underline"
                    variants={itemVariants}
                    whileHover={{ x: 4, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg
                      className="h-4 w-4 mr-2"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
                    </svg>
                    +91 74114 31101
                  </motion.a>

                  <motion.div
                    className="flex items-center px-3 py-2 text-sm text-[#7a7b5f] underline"
                    variants={itemVariants}
                    whileHover={{ x: 4 }}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    cozyberriesofficial@gmail.com
                  </motion.div>

                  <motion.a
                    href="https://instagram.com/cozy_berries"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-3 py-2 text-sm text-[#7a7b5f] hover:text-primary transition-colors underline"
                    variants={itemVariants}
                    whileHover={{ x: 4, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Instagram className="h-4 w-4 mr-2" />
                    @cozy_berries
                  </motion.a>
                </div>
              </motion.div>
            </motion.div>
          </div>

          {/* Fixed Auth Buttons at Bottom */}
          <motion.div
            className="border-t py-4 bg-white"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.3 }}
          >
            <div className="flex justify-center">
              {!loading && (
                <>
                  {!user ? (
                    <motion.div
                      className="flex space-x-2"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.6, duration: 0.3 }}
                    >
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Button asChild variant="outline" size="sm">
                          <Link href="/login" onClick={() => setOpen(false)}>
                            Login
                          </Link>
                        </Button>
                      </motion.div>
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Button asChild size="sm">
                          <Link href="/register" onClick={() => setOpen(false)}>
                            Register
                          </Link>
                        </Button>
                      </motion.div>
                    </motion.div>
                  ) : (
                    <motion.div
                      className="flex space-x-2"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.6, duration: 0.3 }}
                    >
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Button asChild variant="outline" size="sm">
                          <Link href="/profile" onClick={() => setOpen(false)}>
                            Profile
                          </Link>
                        </Button>
                      </motion.div>
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isLoggingOut}
                          onClick={async () => {
                            if (isLoggingOut) return;

                            try {
                              setIsLoggingOut(true);
                              console.log("Logout button clicked");
                              const result = await signOut();
                              console.log("Logout result:", result);

                              if (result.success) {
                                setOpen(false);
                                window.location.href = "/";
                              } else {
                                console.error("Logout failed:", result.error);
                                alert("Logout failed. Please try again.");
                              }
                            } catch (error) {
                              console.error("Logout error:", error);
                              alert("Logout failed. Please try again.");
                            } finally {
                              setIsLoggingOut(false);
                            }
                          }}
                        >
                          {isLoggingOut ? "Logging out..." : "Logout"}
                        </Button>
                      </motion.div>
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
