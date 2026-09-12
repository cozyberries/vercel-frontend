"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, LifeBuoy, Mail, Instagram, Phone, ExternalLink, MapPin, Clock } from "lucide-react";
import { SOCIAL_CONTACTS, WHATSAPP_MESSAGE } from "@/lib/constants/social";

const WhatsAppIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
  </svg>
);

const CHANNELS = [
  {
    key: "whatsapp",
    icon: WhatsAppIcon,
    iconBg: "bg-[#25D366]",
    title: "WhatsApp",
    description: "Chat with us — fastest reply",
    value: SOCIAL_CONTACTS.WHATSAPP_NUMBER,
    href: `https://wa.me/${SOCIAL_CONTACTS.WHATSAPP_NUMBER_CLEAN}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`,
  },
  {
    key: "email",
    icon: Mail,
    iconBg: "bg-cb-terracotta",
    title: "Email",
    description: "We reply within a day",
    value: SOCIAL_CONTACTS.EMAIL,
    href: `mailto:${SOCIAL_CONTACTS.EMAIL}`,
  },
  {
    key: "instagram",
    icon: Instagram,
    iconBg: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
    title: "Instagram",
    description: "DMs & daily softness",
    value: SOCIAL_CONTACTS.INSTAGRAM_HANDLE,
    href: `https://instagram.com/${SOCIAL_CONTACTS.INSTAGRAM_HANDLE_CLEAN}`,
  },
  {
    key: "call",
    icon: Phone,
    iconBg: "bg-cb-espresso",
    title: "Call us",
    description: "9:00 AM – 9:00 PM IST",
    value: SOCIAL_CONTACTS.WHATSAPP_NUMBER,
    href: `tel:+${SOCIAL_CONTACTS.WHATSAPP_NUMBER_CLEAN}`,
  },
];

export default function ContactPage() {
  const router = useRouter();

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="text-cb-fg"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-cb-fg">Contact & Support</h1>
      </div>

      <div className="flex flex-col items-center text-center mb-6 pb-6 border-b border-cb-border">
        <div className="mb-4 flex h-[70px] w-[70px] items-center justify-center rounded-full bg-cb-peach">
          <LifeBuoy className="h-7 w-7 text-cb-terracotta-deep" />
        </div>
        <h2 className="text-xl font-light text-cb-fg mb-2">We&apos;re here to help</h2>
        <p className="text-sm text-cb-muted-fg max-w-[320px]">
          Questions about an order, sizing or our muslin? Reach the CozyBerries team any way you like.
        </p>
      </div>

      <div className="space-y-3 mb-6">
        {CHANNELS.map(({ key, icon: Icon, iconBg, title, description, value, href }) => (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl bg-white border border-cb-border p-4"
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white ${iconBg}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-cb-fg">{title}</p>
              <p className="text-sm text-cb-muted-fg">{description}</p>
              <p className="text-sm font-semibold text-cb-terracotta-deep truncate">{value}</p>
            </div>
            <ExternalLink className="h-4 w-4 text-cb-muted-fg shrink-0" />
          </a>
        ))}
      </div>

      <div className="space-y-3 mb-6">
        <div className="flex items-start gap-3">
          <MapPin className="h-4 w-4 text-cb-terracotta-deep shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-cb-fg">Visit us</p>
            <p className="text-sm text-cb-muted-fg">RT Nagar, Bangalore – 560032</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Clock className="h-4 w-4 text-cb-terracotta-deep shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-cb-fg">Support hours</p>
            <p className="text-sm text-cb-muted-fg">9:00 AM – 9:00 PM IST</p>
          </div>
        </div>
      </div>

      <p className="text-center text-sm text-cb-muted-fg">
        Soft beginnings, wrapped in love 🌿
      </p>
    </div>
  );
}
