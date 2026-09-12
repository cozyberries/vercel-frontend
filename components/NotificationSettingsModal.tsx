"use client";

import { useEffect, useState } from "react";
import { X, Truck, Percent, Sparkles, Heart } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/services/api";
import type {
  NotificationCategory,
  NotificationPreferences,
} from "@/lib/notifications/preferences";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/preferences";

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TOGGLES: { key: NotificationCategory; icon: typeof Truck; title: string; subtitle: string }[] = [
  { key: "order_updates", icon: Truck, title: "Order updates", subtitle: "Shipping, delivery & tracking" },
  { key: "offers", icon: Percent, title: "Offers & discounts", subtitle: "Sales, codes & early access" },
  { key: "back_in_stock", icon: Sparkles, title: "Back in stock", subtitle: "When saved items return" },
  { key: "marketing", icon: Heart, title: "From CozyBerries", subtitle: "Stories, tips & new arrivals" },
];

export default function NotificationSettingsModal({ isOpen, onClose }: NotificationSettingsModalProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [savingKey, setSavingKey] = useState<NotificationCategory | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    getNotificationPreferences()
      .then(setPreferences)
      .catch((err) => console.error("Failed to load notification preferences:", err));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggle = async (key: NotificationCategory, checked: boolean) => {
    const previous = preferences;
    setPreferences((prev) => ({ ...prev, [key]: checked }));
    setSavingKey(key);
    try {
      await updateNotificationPreferences({ [key]: checked });
    } catch (err) {
      console.error("Failed to update notification preference:", err);
      setPreferences(previous);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center md:p-4 z-50">
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-5">
          <h3 className="text-lg font-bold text-cb-fg">Notification settings</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-cb-fg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="divide-y divide-cb-border px-5">
          {TOGGLES.map(({ key, icon: Icon, title, subtitle }) => (
            <div key={key} className="flex items-center gap-3 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cb-peach text-cb-terracotta-deep">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-cb-fg">{title}</p>
                <p className="text-xs text-cb-muted-fg">{subtitle}</p>
              </div>
              <Switch
                checked={preferences[key]}
                disabled={savingKey === key}
                onCheckedChange={(checked) => handleToggle(key, checked)}
                className="data-[state=checked]:bg-cb-terracotta"
              />
            </div>
          ))}
        </div>

        <div className="h-5" />
      </div>
    </div>
  );
}
