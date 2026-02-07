"use client";

import { Mail, Instagram } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface ContactSidebarProps {
  email?: string;
  whatsappNumber?: string;
  instagramHandle?: string;
}

export default function ContactSidebar({
  email = "cozyberriesofficial@gmail.com",
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
              <svg
                className="w-5 h-5 text-foreground"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
              </svg>
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
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="absolute bottom-16 right-0 flex flex-col space-y-3 mb-2"
            >
              {/* Email Button */}
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                transition={{ delay: 0.1, duration: 0.3, ease: "easeOut" }}
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
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                transition={{ delay: 0.15, duration: 0.3, ease: "easeOut" }}
              >
                <Button
                  onClick={handleWhatsAppClick}
                  size="icon"
                  className="rounded-full w-12 h-12 bg-secondary hover:bg-secondary/90 shadow-lg"
                  title="WhatsApp us"
                >
                  <svg
                    className="w-5 h-5 text-secondary-foreground"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
                  </svg>
                </Button>
              </motion.div>

              {/* Instagram Button */}
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                transition={{ delay: 0.2, duration: 0.3, ease: "easeOut" }}
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
            className="rounded-full w-12 h-12 bg-secondary opacity-85 hover:bg-secondary/90 shadow-lg"
          >
            <span className="text-secondary-foreground text-lg font-bold">
              {showPopups ? "✕" : "?"}
            </span>
          </Button>
        </motion.div>
      </div>
    </>
  );
}
