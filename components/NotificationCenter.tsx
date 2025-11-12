// components/NotificationCenter.tsx
"use client";

import React, { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { createPortal } from "react-dom";
import Lottie from 'lottie-react';
import animationData from '@/components/NotificationV3/notification-V3.json';

interface Notification {
    id: string;
    title: string;
    message: string;
    type: string;
    is_read: boolean;
    created_at: string;
}

export default function NotificationCenter() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [open, setOpen] = useState(false);

    const fetchNotifications = async () => {
        const res = await fetch("/api/notifications");
        const data = await res.json();
        setNotifications(data.notifications || []);
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    const markAsRead = async (id: string) => {
        await fetch(`/api/notifications/${id}`, { method: "PATCH" });
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        );
    };

    const panel = open ? (
        <div
            className="fixed left-10 top-14 w-80 bg-white shadow-lg rounded-sm border border-gray-200 z-[9999]"
            style={{ zIndex: 9999 }}
        >
            <div className="p-3 font-semibold border-b">Notifications</div>
            <div className="max-h-80 overflow-y-auto">
                {notifications.length > 0 ? (
                    notifications.map((n) => (
                        <div
                            key={n.id}
                            onClick={() => markAsRead(n.id)}
                            className={`p-3 cursor-pointer ${n.is_read ? "bg-gray-50" : "bg-blue-50"
                                } hover:bg-gray-100 border-b`}
                        >
                            <div className="font-medium">{n.title}</div>
                            <div className="text-sm text-gray-600">{n.message}</div>
                            <div className="text-xs text-gray-400 mt-1">
                                {new Date(n.created_at).toLocaleString()}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="p-3 text-gray-500 text-sm">No notifications</div>
                )}
            </div>
        </div>
    ) : null;


    return (
        <div className="relative">
            <button onClick={() => setOpen(!open)} className="relative pt-2">
                <Lottie
                    animationData={animationData}
                    loop={true}
                    style={{ width: 30, height: 30 }}
                />
                {notifications.some((n) => !n.is_read) && (
                    <span className="absolute top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
                )}
            </button>

            {typeof window !== "undefined" &&
                createPortal(panel, document.body)}
        </div>
    );
}
