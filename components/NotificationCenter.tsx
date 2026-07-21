// components/NotificationCenter.tsx
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, X, LogIn } from "lucide-react";
import { useAuth } from "@/components/supabase-auth-provider";
import { useNotifications } from "@/hooks/useApiQueries";

export default function NotificationCenter() {
    const { user } = useAuth();
    const router = useRouter();
    const { data: notifications } = useNotifications(user?.id);
    const hasUnread = (notifications ?? []).some((n) => !n.is_read);
    const [guestPromptOpen, setGuestPromptOpen] = useState(false);

    const handleClick = () => {
        if (user) {
            router.push("/notifications");
        } else {
            setGuestPromptOpen(true);
        }
    };

    const guestPanel = guestPromptOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-cb-fg">Notifications</h2>
                    <button
                        onClick={() => setGuestPromptOpen(false)}
                        className="text-cb-fg hover:text-cb-muted-fg"
                        aria-label="Close notifications"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="flex flex-col items-center text-center">
                    <div className="mb-5 flex h-[70px] w-[70px] items-center justify-center rounded-full bg-cb-linen">
                        <Bell className="h-7 w-7 text-cb-fg" />
                    </div>
                    <h3 className="text-lg font-semibold text-cb-fg mb-2">
                        Log in to see notifications
                    </h3>
                    <p className="text-sm text-cb-muted-fg mb-6">
                        Order updates, restocks and offers will land here once you&apos;re logged in.
                    </p>
                    <Link
                        href="/login"
                        onClick={() => setGuestPromptOpen(false)}
                        className="flex w-full items-center justify-center gap-2 rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white h-12 text-[15px] font-semibold"
                    >
                        <LogIn className="h-4 w-4" />
                        Log in or sign up
                    </Link>
                </div>
            </div>
        </div>
    ) : null;

    return (
        <div className="relative">
            <button
                onClick={handleClick}
                className="relative flex items-center justify-center rounded-full h-10 w-10 hover:bg-cb-muted transition-colors duration-200"
                aria-label={user ? "Go to notifications" : "Toggle notifications"}
            >
                <Bell className="h-5 w-5" />
                {user && hasUnread && (
                    <span className="absolute top-2 right-2 h-2 w-2 bg-red-500 rounded-full" />
                )}
            </button>

            {typeof window !== "undefined" && guestPromptOpen && createPortal(guestPanel, document.body)}
        </div>
    );
}
