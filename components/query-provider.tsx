"use client";

import { ReactNode, useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

/** Only the catalog snapshot and search rankings survive reloads; everything else is per-session. */
const PERSISTED_QUERY_KEYS = new Set(["catalog", "catalog-ranking"]);
/** Bump when the persisted shapes change so stale entries are dropped. */
const PERSIST_BUSTER = "catalog-v1";

export function QueryProvider({ children }: { children: ReactNode }) {
  // Create QueryClient per provider instance to ensure cache isolation
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60, // 1 minute - data considered fresh for 1 minute
            gcTime: 1000 * 60 * 5, // 5 minutes - cache kept for 5 minutes after last use
            retry: 1, // Retry failed requests once
            refetchOnWindowFocus: false, // Catalog queries opt in individually
          },
        },
      })
  );
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window === "undefined" ? undefined : window.localStorage,
      key: "cb-query-cache",
      throttleTime: 1000,
    })
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        buster: PERSIST_BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            PERSISTED_QUERY_KEYS.has(String(query.queryKey[0])) && query.state.status === "success",
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
