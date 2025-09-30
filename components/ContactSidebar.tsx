"use client";

import { Mail, MessageCircle, Instagram } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface ContactSidebarProps {
  email?: string;
  whatsappNumber?: string;
  instagramHandle?: string;
}

export default function ContactSidebar({
  email = "hello@cozyberries.com",
  whatsappNumber = "+1234567890",
  instagramHandle = "@cozyberries",
}: ContactSidebarProps) {
  const [showPopups, setShowPopups] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popups when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowPopups(false);
      }
    };

    if (showPopups) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPopups]);

  const handleEmailClick = () => {
    window.location.href = `mailto:${email}`;
    setShowPopups(false);
  };

  const handleWhatsAppClick = () => {
    const message = encodeURIComponent(
      "Hello! I'd like to get in touch about your products."
    );
    window.open(
      `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}?text=${message}`,
      "_blank"
    );
    setShowPopups(false);
  };

  const handleInstagramClick = () => {
    window.open(
      `https://instagram.com/${instagramHandle.replace("@", "")}`,
      "_blank"
    );
    setShowPopups(false);
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="fixed right-0 top-1/2 transform -translate-y-1/2 z-50 hidden md:block">
        <div className="bg-background border border-border rounded-l-lg shadow-lg">
          <div className="py-3 px-2 space-y-2 flex flex-col justify-center items-center">
            {/* Email */}
            <button
              onClick={handleEmailClick}
              className="p-2 rounded-md hover:bg-muted transition-colors duration-200"
              title="Email us"
            >
              <Mail className="w-5 h-5 text-foreground" />
            </button>

            {/* WhatsApp */}
            <button
              onClick={handleWhatsAppClick}
              className="p-2 rounded-md hover:bg-muted transition-colors duration-200"
              title="WhatsApp us"
            >
              <MessageCircle className="w-5 h-5 text-foreground" />
            </button>

            {/* Instagram */}
            <button
              onClick={handleInstagramClick}
              className="p-2 rounded-md hover:bg-muted transition-colors duration-200"
              title="Follow us on Instagram"
            >
              <Instagram className="w-5 h-5 text-foreground" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Contact Button with Popup */}
      <div
        ref={containerRef}
        className="fixed bottom-36 right-4 z-50 md:hidden"
      >
        {/* Popup Buttons */}
        <AnimatePresence>
          {showPopups && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute bottom-16 right-0 flex flex-col space-y-3 mb-2"
            >
              {/* Email Button */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1, duration: 0.2 }}
              >
                <Button
                  onClick={handleEmailClick}
                  size="icon"
                  className="rounded-full w-12 h-12 bg-secondary hover:bg-secondary/90 shadow-lg"
                  title="Email us"
                >
                  <Mail className="w-5 h-5 text-secondary-foreground" />
                </Button>
              </motion.div>

              {/* WhatsApp Button */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15, duration: 0.2 }}
              >
                <Button
                  onClick={handleWhatsAppClick}
                  size="icon"
                  className="rounded-full w-12 h-12 bg-secondary hover:bg-secondary/90 shadow-lg"
                  title="WhatsApp us"
                >
                  <MessageCircle className="w-5 h-5 text-secondary-foreground" />
                </Button>
              </motion.div>

              {/* Instagram Button */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.2 }}
              >
                <Button
                  onClick={handleInstagramClick}
                  size="icon"
                  className="rounded-full w-12 h-12 bg-secondary hover:bg-secondary/90 shadow-lg"
                  title="Follow us on Instagram"
                >
                  <Instagram className="w-5 h-5 text-secondary-foreground" />
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Contact Button */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: 0.1 }}
        >
          <Button
            onClick={() => setShowPopups(!showPopups)}
            size="icon"
            className="rounded-full w-12 h-12 bg-secondary hover:bg-secondary/90 shadow-lg"
          >
            <span className="text-secondary-foreground text-lg font-bold">
              ?
            </span>
          </Button>
        </motion.div>
      </div>
    </>
  );
}
