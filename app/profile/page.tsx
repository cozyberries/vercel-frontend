"use client";

import React from "react";
import Link from "next/link";
import { User, LogIn, ChevronRight, LogOut, UserPlus, ClipboardList } from "lucide-react";
import { useAuth } from "@/components/supabase-auth-provider";
import { Button } from "@/components/ui/button";
import { formatIndianPhoneDisplay } from "@/lib/utils/validation";
import AccountMenuList from "@/components/AccountMenuList";
import UserPickerModal from "@/components/admin/UserPickerModal";
import { useProfile } from "@/hooks/useProfile";
import { SOCIAL_CONTACTS } from "@/lib/constants/social";

export default function ProfilePage() {
  const { user, isAdmin, signOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const { profile, isLoading } = useProfile(user);

  if (!mounted || (user && isLoading)) {
    return (
      <div className="container mx-auto px-4 py-6 animate-pulse">
        <div className="rounded-2xl bg-cb-linen p-5 mb-2">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 bg-gray-200 rounded" />
              <div className="h-3 w-56 bg-gray-200 rounded" />
            </div>
          </div>
        </div>
        <div className="space-y-3 mt-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-5 w-full bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="rounded-2xl bg-cb-linen p-5 mb-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white">
              <User className="h-6 w-6 text-cb-fg" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-cb-fg">Browsing as guest</p>
              <p className="text-sm text-cb-muted-fg">
                Log in to see your orders, addresses &amp; notifications.
              </p>
            </div>
          </div>
          <Button
            asChild
            className="w-full rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white h-12 text-[15px] font-semibold gap-2"
          >
            <Link href="/login">
              <LogIn className="h-4 w-4" />
              Log in or sign up
            </Link>
          </Button>
        </div>

        <AccountMenuList />

        <p className="mt-6 text-center text-sm text-cb-muted-fg">
          CozyBerries · RT Nagar, Bangalore – 560032
        </p>
      </div>
    );
  }

  const initials = (profile?.full_name || user.email || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  const handleSignOut = async () => {
    if (isLoggingOut) return;
    try {
      setIsLoggingOut(true);
      const result = await signOut();
      if (result.success) {
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
  };

  return (
    <div className="container mx-auto max-w-lg px-4 py-6">
      <Link
        href="/profile/account-details"
        className="flex items-center gap-3 rounded-2xl bg-cb-linen p-5 mb-2"
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-lg font-semibold text-cb-terracotta-deep">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-cb-fg truncate">
            {profile?.full_name || "Welcome back"}
          </p>
          <p className="text-sm text-cb-muted-fg truncate">
            {profile?.phone ? `+91 ${formatIndianPhoneDisplay(profile.phone)}` : SOCIAL_CONTACTS.EMAIL}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-cb-muted-fg shrink-0" />
      </Link>

      <AccountMenuList />

      {isAdmin && (
        <div className="mt-6 space-y-2">
          <h3 className="text-sm font-bold text-cb-fg mb-3">Admin</h3>
          <Button
            variant="outline"
            onClick={() => setPickerOpen(true)}
            className="w-full rounded-full border-cb-border"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Impersonate user
          </Button>
          <Button variant="outline" asChild className="w-full rounded-full border-cb-border">
            <Link href="/admin/on-behalf-orders">
              <ClipboardList className="w-4 h-4 mr-2" />
              On-behalf orders
            </Link>
          </Button>
        </div>
      )}

      <Button
        variant="outline"
        onClick={handleSignOut}
        disabled={isLoggingOut}
        className="w-full rounded-full border-cb-destructive text-cb-destructive hover:bg-cb-destructive/5 mt-6 h-12 font-semibold gap-2"
      >
        <LogOut className="h-4 w-4" />
        {isLoggingOut ? "Logging out..." : "Log out"}
      </Button>

      <p className="mt-6 text-center text-sm text-cb-muted-fg">
        CozyBerries · RT Nagar, Bangalore – 560032
      </p>

      {isAdmin && <UserPickerModal open={pickerOpen} onOpenChange={setPickerOpen} />}
    </div>
  );
}
