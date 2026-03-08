"use client";

import Link from "next/link";
import Image from "next/image";
import { Mail, Instagram, MapPin, Clock } from "lucide-react";
import { images } from "@/app/assets/images";
import { SOCIAL_CONTACTS } from "@/lib/constants/social";

const footerLinks = [
  {
    title: "About",
    links: [{ name: "Our Story", href: "/about" }],
  },
];

const WhatsAppIcon = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
  </svg>
);

export default function Footer() {
  return (
    <footer className="bg-[#f5eee0] border-t">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Logo and description */}
          <div className="lg:col-span-2">
            <Link href="/" className="inline-block mb-6">
              <Image
                src={images.logoURL || "/placeholder.svg"}
                alt="CozyBerries"
                width={180}
                height={50}
                className="h-12 w-auto"
              />
            </Link>
            <p className="text-muted-foreground mb-6 max-w-md">
              Adorable, high-quality clothing for your little ones. Crafted with
              love, designed for comfort, and made to last.
            </p>
          </div>

          {/* Contact details */}
          <div className="lg:col-span-2">
            <h3 className="font-medium mb-4">Contact Us</h3>
            <ul className="space-y-3">
              <li>
                <a
                  href={`mailto:${SOCIAL_CONTACTS.EMAIL}`}
                  className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  <span>{SOCIAL_CONTACTS.EMAIL}</span>
                </a>
              </li>
              <li>
                <a
                  href={`https://wa.me/${SOCIAL_CONTACTS.WHATSAPP_NUMBER_CLEAN}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                >
                  <WhatsAppIcon />
                  <span>{SOCIAL_CONTACTS.WHATSAPP_NUMBER}</span>
                </a>
              </li>
              <li>
                <a
                  href={`https://instagram.com/${SOCIAL_CONTACTS.INSTAGRAM_HANDLE_CLEAN}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Instagram className="h-4 w-4 shrink-0" />
                  <span>{SOCIAL_CONTACTS.INSTAGRAM_HANDLE}</span>
                </a>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                <span>RT Nagar, Bangalore – 560032</span>
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span>9:00 AM – 9:00 PM IST</span>
              </li>
            </ul>
          </div>

          {/* Footer links */}
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h3 className="font-medium mb-4">{section.title}</h3>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm text-muted-foreground mb-4 md:mb-0">
            © {new Date().getFullYear()} CozyBerries. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
