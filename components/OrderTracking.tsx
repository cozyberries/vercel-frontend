"use client";

import { useState, useEffect } from "react";
import {
  Package,
  Truck,
  CheckCircle,
  Clock,
  MapPin,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TrackingInfo, TrackingEvent } from "@/lib/types/shipping";

interface OrderTrackingProps {
  waybill: string;
}

const STATUS_STEPS = [
  { key: "manifested", label: "Order Placed", icon: Package },
  { key: "picked_up", label: "Picked Up", icon: Package },
  { key: "in_transit", label: "In Transit", icon: Truck },
  { key: "out_for_delivery", label: "Out for Delivery", icon: Truck },
  { key: "delivered", label: "Delivered", icon: CheckCircle },
];

function getStepIndex(status: string): number {
  const s = status.toLowerCase();
  if (s.includes("delivered")) return 4;
  if (s.includes("out for delivery") || s.includes("out_for_delivery")) return 3;
  if (s.includes("in transit") || s.includes("in_transit") || s.includes("transit")) return 2;
  if (s.includes("picked up") || s.includes("pickup") || s.includes("dispatched")) return 1;
  return 0;
}

function formatTrackingDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export default function OrderTracking({ waybill }: OrderTrackingProps) {
  const [tracking, setTracking] = useState<TrackingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);

  const fetchTrackingData = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/shipping/tracking/${waybill}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch tracking");
      }
      const data: TrackingInfo = await res.json();
      setTracking(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load tracking");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrackingData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waybill]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading tracking...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6">
        <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchTrackingData}>
          <RefreshCw className="w-3 h-3 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!tracking) return null;

  const currentStep = getStepIndex(tracking.current_status);
  const visibleEvents = showAllEvents
    ? tracking.events
    : tracking.events.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="relative">
        <div className="flex items-center justify-between">
          {STATUS_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isCompleted = idx <= currentStep;
            const isCurrent = idx === currentStep;

            return (
              <div key={step.key} className="flex flex-col items-center flex-1">
                <div
                  className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                    isCompleted
                      ? isCurrent
                        ? "bg-primary border-primary text-white"
                        : "bg-green-500 border-green-500 text-white"
                      : "bg-white border-gray-200 text-gray-400"
                  }`}
                >
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <span
                  className={`mt-2 text-[10px] sm:text-xs text-center leading-tight ${
                    isCompleted ? "font-medium text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
        {/* Progress line */}
        <div className="absolute top-4 sm:top-5 left-0 right-0 h-0.5 bg-gray-200 -z-10 mx-8 sm:mx-12">
          <div
            className="h-full bg-green-500 transition-all duration-500"
            style={{ width: `${(currentStep / (STATUS_STEPS.length - 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Current Status */}
      <div className="bg-muted/30 rounded-lg p-3 sm:p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium">{tracking.current_status}</span>
          <Button variant="ghost" size="sm" onClick={fetchTrackingData} className="h-7 px-2">
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
          <MapPin className="w-3 h-3 shrink-0" />
          <span>{tracking.current_location}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <Clock className="w-3 h-3 shrink-0" />
          <span>{formatTrackingDate(tracking.current_status_timestamp)}</span>
        </div>
        {tracking.expected_delivery_date && (
          <div className="mt-2 pt-2 border-t text-xs sm:text-sm">
            <span className="text-muted-foreground">Expected delivery: </span>
            <span className="font-medium">
              {formatTrackingDate(tracking.expected_delivery_date)}
            </span>
          </div>
        )}
      </div>

      {/* Tracking Events Timeline */}
      {tracking.events.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">Tracking History</h3>
          <div className="space-y-0">
            {visibleEvents.map((event, idx) => (
              <div key={idx} className="flex gap-3">
                {/* Timeline dot and line */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${
                      idx === 0 ? "bg-primary" : "bg-gray-300"
                    }`}
                  />
                  {idx < visibleEvents.length - 1 && (
                    <div className="w-px flex-1 bg-gray-200 my-1" />
                  )}
                </div>

                {/* Event content */}
                <div className="pb-4 min-w-0">
                  <p
                    className={`text-sm ${
                      idx === 0 ? "font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {event.status}
                  </p>
                  {event.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {event.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {event.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {event.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTrackingDate(event.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {tracking.events.length > 5 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllEvents(!showAllEvents)}
              className="w-full mt-2 text-xs"
            >
              {showAllEvents
                ? "Show less"
                : `Show all ${tracking.events.length} events`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
