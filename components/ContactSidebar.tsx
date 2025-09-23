"use client";

import { Mail, MessageCircle, Instagram } from "lucide-react";

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
  const handleEmailClick = () => {
    window.location.href = `mailto:${email}`;
  };

  const handleWhatsAppClick = () => {
    const message = encodeURIComponent(
      "Hello! I'd like to get in touch about your products."
    );
    window.open(
      `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}?text=${message}`,
      "_blank"
    );
  };

  const handleInstagramClick = () => {
    window.open(
      `https://instagram.com/${instagramHandle.replace("@", "")}`,
      "_blank"
    );
  };

  return (
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
  );
}
