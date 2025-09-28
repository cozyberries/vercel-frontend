"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  Menu,
  Settings,
  ChevronDown,
  ChevronRight,
  Home,
  MessageCircle,
  Mail,
  Instagram,
} from "lucide-react";
import { useState } from "react";
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

// Age ranges data from age-grid component
const ageRanges = [
  {
    id: "0-3m",
    name: "0-3 Months",
    slug: "0-3-months",
    description: "Newborn essentials",
  },
  {
    id: "3-6m",
    name: "3-6 Months",
    slug: "3-6-months",
    description: "Growing baby comfort",
  },
  {
    id: "6-12m",
    name: "6-12 Months",
    slug: "6-12-months",
    description: "Active crawler styles",
  },
  {
    id: "1-2y",
    name: "1-2 Years",
    slug: "1-2-years",
    description: "Toddler adventures",
  },
  {
    id: "2-3y",
    name: "2-3 Years",
    slug: "2-3-years",
    description: "Independent explorer",
  },
  {
    id: "3-6y",
    name: "3-6 Years",
    slug: "3-6-years",
    description: "Little personality",
  },
];

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
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: "auto" },
};

const chevronVariants = {
  closed: { rotate: 0 },
  open: { rotate: 90 },
};

export const HamburgerSheet = () => {
  const pathname = usePathname();
  const { user, loading, signOut, isAdmin } = useAuth();
  const { categories, isLoading: categoriesLoading } = usePreloadedData();
  const [open, setOpen] = useState(false);
  const [expandedDropdowns, setExpandedDropdowns] = useState<string[]>([]);

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
      <SheetContent side="left" className="w-80">
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
            <motion.div
              className="space-y-1"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
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
                    variants={chevronVariants}
                    animate={
                      expandedDropdowns.includes("shop-by-age")
                        ? "open"
                        : "closed"
                    }
                    transition={{ duration: 0.2 }}
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
                      className="ml-2 overflow-hidden"
                    >
                      {ageRanges.map((ageRange) => (
                        <DropdownItem
                          key={ageRange.id}
                          href={`/products?age=${ageRange.slug}`}
                        >
                          {ageRange.name}
                        </DropdownItem>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Girls Clothing Dropdown */}
              <div>
                <MenuItem onClick={() => toggleDropdown("girls-clothing")}>
                  <div className="flex items-center">Girls Clothing</div>
                  <motion.div
                    variants={chevronVariants}
                    animate={
                      expandedDropdowns.includes("girls-clothing")
                        ? "open"
                        : "closed"
                    }
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </motion.div>
                </MenuItem>
                <AnimatePresence>
                  {expandedDropdowns.includes("girls-clothing") && (
                    <motion.div
                      variants={dropdownVariants}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                      className="ml-2 overflow-hidden"
                    >
                      <DropdownItem href="/products?category=frocks">
                        Frocks
                      </DropdownItem>
                      <DropdownItem href="/products?category=coord-sets-girls">
                        Coord Sets
                      </DropdownItem>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Boys Clothing Dropdown */}
              <div>
                <MenuItem onClick={() => toggleDropdown("boys-clothing")}>
                  <div className="flex items-center">Boys Clothing</div>
                  <motion.div
                    variants={chevronVariants}
                    animate={
                      expandedDropdowns.includes("boys-clothing")
                        ? "open"
                        : "closed"
                    }
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </motion.div>
                </MenuItem>
                <AnimatePresence>
                  {expandedDropdowns.includes("boys-clothing") && (
                    <motion.div
                      variants={dropdownVariants}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                      className="ml-2 overflow-hidden"
                    >
                      <DropdownItem href="/products?category=coord-sets-boys">
                        Coord Sets
                      </DropdownItem>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Unisex Dropdown */}
              <div>
                <MenuItem onClick={() => toggleDropdown("unisex")}>
                  <div className="flex items-center">Unisex</div>
                  <motion.div
                    variants={chevronVariants}
                    animate={
                      expandedDropdowns.includes("unisex") ? "open" : "closed"
                    }
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </motion.div>
                </MenuItem>
                <AnimatePresence>
                  {expandedDropdowns.includes("unisex") && (
                    <motion.div
                      variants={dropdownVariants}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                      className="ml-2 overflow-hidden"
                    >
                      <DropdownItem href="/products?category=jhabla-shorts-unisex">
                        Jhabla and Shorts
                      </DropdownItem>
                      <DropdownItem href="/products?category=pyjamas">
                        Pyjamas
                      </DropdownItem>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Accessories */}
              <MenuItem href="/products?category=accessories">
                <div className="flex items-center">Accessories</div>
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
                    className="flex items-center px-3 py-2 text-sm text-foreground/80 hover:text-primary transition-colors"
                    variants={itemVariants}
                    whileHover={{ x: 4, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    WhatsApp: +91 74114 31101
                  </motion.a>

                  <motion.div
                    className="flex items-center px-3 py-2 text-sm text-foreground/80"
                    variants={itemVariants}
                    whileHover={{ x: 4 }}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Email: cozyberries@gmail.com
                  </motion.div>

                  <motion.a
                    href="https://instagram.com/cozy_berries"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-3 py-2 text-sm text-foreground/80 hover:text-primary transition-colors"
                    variants={itemVariants}
                    whileHover={{ x: 4, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Instagram className="h-4 w-4 mr-2" />
                    Instagram: @cozy_berries
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
                      {isAdmin && (
                        <motion.div
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Button asChild variant="outline" size="sm">
                            <Link href="/admin" onClick={() => setOpen(false)}>
                              Admin
                            </Link>
                          </Button>
                        </motion.div>
                      )}
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await signOut();
                            setOpen(false);
                            window.location.href = "/";
                          }}
                        >
                          Logout
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
