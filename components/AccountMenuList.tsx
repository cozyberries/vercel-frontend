import Link from "next/link";
import { Package, MapPin, Heart, Percent, Bell, Sprout, LifeBuoy, ChevronRight } from "lucide-react";
import { getActiveOffer } from "@/lib/utils/discount";
import { useAuth } from "@/components/supabase-auth-provider";
import { useNotifications } from "@/hooks/useApiQueries";

const MENU_ITEMS = [
  { icon: Package, label: "My Orders", href: "/orders" },
  { icon: MapPin, label: "Addresses", href: "/profile/addresses" },
  { icon: Heart, label: "Wishlist", href: "/wishlist" },
  { icon: Percent, label: "Offers", href: "/offers", offerBadge: true },
  { icon: Bell, label: "Notifications", href: "/notifications", unreadBadge: true },
  { icon: Sprout, label: "Our Story", href: "/about" },
  { icon: LifeBuoy, label: "Contact & Support", href: "/contact" },
];

export default function AccountMenuList() {
  const offer = getActiveOffer();
  const { user } = useAuth();
  const { data: notifications } = useNotifications(user?.id);
  const unreadCount = notifications?.filter((n) => !n.is_read).length ?? 0;

  return (
    <div className="divide-y divide-cb-border">
      {MENU_ITEMS.map(({ icon: Icon, label, href, offerBadge, unreadBadge }) => (
        <Link
          key={label}
          href={href}
          className="flex items-center gap-3 py-4 text-cb-fg"
        >
          <Icon className="h-5 w-5 text-cb-fg shrink-0" />
          <span className="flex-1 text-[15px] font-medium">{label}</span>
          {offerBadge && offer && (
            <span className="rounded-full bg-cb-peach px-2.5 py-1 text-[11px] font-bold text-cb-terracotta-deep">
              {offer.code}
            </span>
          )}
          {unreadBadge && unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cb-terracotta-deep px-1 text-[11px] font-bold text-white">
              {unreadCount}
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-cb-muted-fg shrink-0" />
        </Link>
      ))}
    </div>
  );
}
