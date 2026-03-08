"use client";

import { ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: ReactNode }) {
  // Create QueryClient per provider instance to ensure cache isolation
  // Using useState with initializer guarantees one instance per component lifetime
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Automatic request deduplication: prevent duplicate requests if made within this window
            staleTime: 1000 * 60, // 1 minute - data considered fresh for 1 minute
            gcTime: 1000 * 60 * 5, // 5 minutes - cache kept for 5 minutes after last use
            retry: 1, // Retry failed requests once
            refetchOnWindowFocus: false, // Don't refetch on window focus in dev/slow networks
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
