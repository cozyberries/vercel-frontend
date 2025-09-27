import { useAuth } from "@/components/supabase-auth-provider";
import { useCallback } from "react";

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
  requireAdmin?: boolean;
}

export function useAuthenticatedFetch() {
  const { jwtToken, isAuthenticated, isAdmin } = useAuth();

  const authenticatedFetch = useCallback(
    async (url: string, options: FetchOptions = {}) => {
      const {
        requireAuth = false,
        requireAdmin = false,
        ...fetchOptions
      } = options;

      // Check authentication requirements
      if (requireAuth && !isAuthenticated) {
        throw new Error("Authentication required");
      }

      if (requireAdmin && !isAdmin) {
        throw new Error("Admin privileges required");
      }

      // Prepare headers
      const headers = new Headers(fetchOptions.headers);

      // Add JWT token to headers if available
      if (jwtToken) {
        headers.set("Authorization", `Bearer ${jwtToken}`);
      }

      // Add content type for POST/PUT requests (but not for FormData)
      if (
        !headers.has("Content-Type") &&
        (fetchOptions.method === "POST" || fetchOptions.method === "PUT") &&
        !(fetchOptions.body instanceof FormData)
      ) {
        headers.set("Content-Type", "application/json");
      }

      // Make the request
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
      });

      // Handle common error responses
      if (response.status === 401) {
        throw new Error("Authentication failed - please log in again");
      }

      if (response.status === 403) {
        throw new Error("Access denied - insufficient permissions");
      }

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Request failed" }));
        throw new Error(
          errorData.error || `Request failed with status ${response.status}`
        );
      }

      return response;
    },
    [jwtToken, isAuthenticated, isAdmin]
  );

  const get = useCallback(
    (url: string, options: Omit<FetchOptions, "method"> = {}) => {
      return authenticatedFetch(url, { ...options, method: "GET" });
    },
    [authenticatedFetch]
  );

  const post = useCallback(
    (
      url: string,
      data?: any,
      options: Omit<FetchOptions, "method" | "body"> = {}
    ) => {
      // Handle both direct data and options.body
      let body: any;
      if (options.body !== undefined) {
        body = options.body;
      } else if (data !== undefined) {
        body = data instanceof FormData ? data : JSON.stringify(data);
      }

      return authenticatedFetch(url, {
        ...options,
        method: "POST",
        body,
      });
    },
    [authenticatedFetch]
  );

  const put = useCallback(
    (
      url: string,
      data?: any,
      options: Omit<FetchOptions, "method" | "body"> = {}
    ) => {
      // Handle both direct data and options.body
      let body: any;
      if (options.body !== undefined) {
        body = options.body;
      } else if (data !== undefined) {
        body = data instanceof FormData ? data : JSON.stringify(data);
      }

      return authenticatedFetch(url, {
        ...options,
        method: "PUT",
        body,
      });
    },
    [authenticatedFetch]
  );

  const patch = useCallback(
    (
      url: string,
      data?: any,
      options: Omit<FetchOptions, "method" | "body"> = {}
    ) => {
      // Handle both direct data and options.body
      let body: any;
      if (options.body !== undefined) {
        body = options.body;
      } else if (data !== undefined) {
        body = data instanceof FormData ? data : JSON.stringify(data);
      }

      return authenticatedFetch(url, {
        ...options,
        method: "PATCH",
        body,
      });
    },
    [authenticatedFetch]
  );

  const del = useCallback(
    (url: string, options: Omit<FetchOptions, "method"> = {}) => {
      return authenticatedFetch(url, { ...options, method: "DELETE" });
    },
    [authenticatedFetch]
  );

  return {
    fetch: authenticatedFetch,
    get,
    post,
    put,
    patch,
    delete: del,
    isAuthenticated,
    isAdmin,
  };
}
