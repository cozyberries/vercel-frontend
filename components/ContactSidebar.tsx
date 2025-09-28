"use client";

import { Mail, MessageCircle, Instagram } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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
  const [isOpen, setIsOpen] = useState(false);

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

      {/* Mobile Contact Button */}
      <div className="fixed bottom-20 right-4 z-50 md:hidden">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button
              size="lg"
              className="rounded-full w-14 h-14 bg-primary hover:bg-primary/90 shadow-lg"
            >
              <MessageCircle className="w-6 h-6 text-white" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[300px]">
            <SheetHeader>
              <SheetTitle>Get in Touch</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col space-y-4 mt-6">
              <Button
                onClick={handleEmailClick}
                variant="outline"
                className="w-full justify-start"
              >
                <Mail className="w-5 h-5 mr-3" />
                Email us
              </Button>
              <Button
                onClick={handleWhatsAppClick}
                variant="outline"
                className="w-full justify-start"
              >
                <MessageCircle className="w-5 h-5 mr-3" />
                WhatsApp us
              </Button>
              <Button
                onClick={handleInstagramClick}
                variant="outline"
                className="w-full justify-start"
              >
                <Instagram className="w-5 h-5 mr-3" />
                Follow us on Instagram
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
