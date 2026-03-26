"use client";

import { Loader2, AlertCircle, RefreshCw, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useOrderShipmentTracking } from "@/hooks/useApiQueries";

interface ShipmentTrackingSectionProps {
  orderId: string;
  /** Display-only; tracking is loaded by order id via API. */
  waybill: string;
}

export function ShipmentTrackingSection({
  orderId,
  waybill,
}: ShipmentTrackingSectionProps) {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useOrderShipmentTracking(orderId, true);

  return (
    <section
      id="shipment-tracking"
      className="mt-4 border border-gray-200 rounded-lg p-4 sm:p-6 bg-white"
      aria-labelledby="shipment-tracking-heading"
    >
      <h2
        id="shipment-tracking-heading"
        className="text-base sm:text-lg font-semibold mb-3"
      >
        Shipment tracking
      </h2>

      {isLoading && !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="w-5 h-5 animate-spin shrink-0" aria-hidden />
          <span>Loading carrier updates…</span>
        </div>
      ) : null}

      {isError ? (
        <Alert variant="destructive" className="mb-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load tracking</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
            <span>
              {error instanceof Error
                ? error.message
                : "Please try again in a moment."}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit border-destructive/50 inline-flex items-center gap-2"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {data ? (
        <div className="space-y-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Waybill </span>
            <span className="font-mono font-medium break-all">{waybill}</span>
          </div>
          {data.currentStatus ? (
            <div className="text-sm">
              <span className="text-muted-foreground">Carrier status </span>
              <span className="font-medium">{data.currentStatus}</span>
            </div>
          ) : null}

          {data.scans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No scan history returned yet. Check back later.
            </p>
          ) : (
            <ol className="relative border-s border-border ms-2 space-y-4 ps-6">
              {data.scans.map((scan, index) => (
                <li
                  key={`${scan.timestamp ?? ""}-${scan.status}-${index}`}
                  className="relative"
                >
                  <span
                    className="absolute -start-[25px] flex h-3 w-3 rounded-full bg-primary mt-1.5 ring-4 ring-background"
                    aria-hidden
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{scan.status}</p>
                    {scan.timestamp ? (
                      <p className="text-xs text-muted-foreground">
                        {scan.timestamp}
                      </p>
                    ) : null}
                    {scan.location ? (
                      <p className="text-xs text-muted-foreground flex items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {scan.location}
                      </p>
                    ) : null}
                    {scan.remarks ? (
                      <p className="text-xs text-muted-foreground">
                        {scan.remarks}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}
