"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { createClient } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import {
  requestAuthToken,
  resolveAuthToken,
  type ResolveAuthTokenResult,
} from "@/lib/auth/generate-jwt-token";

interface UserProfile {
  id: string;
  role: "customer" | "admin" | "super_admin";
}

export interface ImpersonationTarget {
  id: string;
  email: string | null;
  full_name: string | null;
}

export interface ImpersonationState {
  active: boolean;
  target: ImpersonationTarget | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userProfile: UserProfile | null;
  jwtToken: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  impersonation: ImpersonationState;
  /**
   * True once the client has resolved `/api/admin/impersonation/state` at
   * least once for the current session. Hooks that read/write user-scoped
   * data (cart, wishlist) should wait for this before their first fetch,
   * so they don't accidentally act against the wrong effective user during
   * the initial hydration race.
   */
  impersonationReady: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, phone?: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signOut: () => Promise<{ success: boolean; error?: any }>;
  refreshProfile: () => Promise<void>;
  refreshImpersonation: () => Promise<void>;
  stopImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_IMPERSONATION: ImpersonationState = { active: false, target: null };

export function SupabaseAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [impersonation, setImpersonation] = useState<ImpersonationState>(
    DEFAULT_IMPERSONATION
  );
  const [impersonationReady, setImpersonationReady] = useState(false);

  // Create supabase client once and reuse it
  const [supabase] = useState(() => createClient());

  // In-flight request deduplication for fetch-based calls
  const inflightRef = useRef<Map<string, Promise<any>>>(new Map());
  const isMountedRef = useRef(true);

  // Refs mirroring state that the token-mint flow needs to read without
  // re-subscribing. `impersonationActiveRef` lets `mintAuthToken` gate the
  // HTTP call on the latest impersonation state even when invoked from a
  // memoised callback; `jwtTokenRef` exposes the previously-minted token so
  // `resolveAuthToken` can preserve it across impersonation and transient
  // network errors instead of silently wiping a still-valid JWT.
  const impersonationActiveRef = useRef(false);
  const jwtTokenRef = useRef<string | null>(null);

  // Mint a JWT for the given session user, gated on impersonation state.
  // Returns the resolved `{ token, action }` so callers can decide whether
  // to commit the token to state (unchanged values short-circuit the
  // downstream render). Deduplicated per userId + impersonation state so
  // concurrent callers don't double-post to `/api/auth/generate-token`.
  const mintAuthToken = useCallback(
    async (
      userId: string,
      userEmail: string | undefined
    ): Promise<ResolveAuthTokenResult> => {
      const key = `token:${userId}:${impersonationActiveRef.current ? "imp" : "normal"}`;
      const existing = inflightRef.current.get(key) as
        | Promise<ResolveAuthTokenResult>
        | undefined;
      if (existing) return existing;

      const promise = resolveAuthToken({
        userId,
        userEmail,
        impersonationActive: impersonationActiveRef.current,
        previousToken: jwtTokenRef.current,
        request: requestAuthToken,
      }).finally(() => {
        inflightRef.current.delete(key);
      });

      inflightRef.current.set(key, promise);
      return promise;
    },
    []
  );

  // Helper function to create user profile if it doesn't exist (deduplicated)
  const ensureUserProfile = useCallback(async (userId: string) => {
    const key = `profile:${userId}`;
    const existing = inflightRef.current.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const response = await fetch("/api/profile/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (response.ok) {
          const data = await response.json();
          return { success: true, profile: data.profile };
        } else {
          console.warn("Failed to create user profile:", await response.text());
          return { success: false };
        }
      } catch (error) {
        console.error("Error ensuring user profile:", error);
        return { success: false };
      }
    })().finally(() => { inflightRef.current.delete(key); });

    inflightRef.current.set(key, promise);
    return promise;
  }, []);

  // Helper function to update user profile.
  //
  // Token lifecycle is deliberately NOT handled here — it lives in a
  // dedicated effect below that waits for impersonation state to resolve
  // before minting. Doing it here would race the impersonation probe and
  // fire `/api/auth/generate-token` with the `acting_as` cookie still in
  // flight, which the server (correctly) refuses with 403.
  const updateUserProfile = useCallback(async (currentSession: Session | null) => {
    if (currentSession?.user) {
      try {
        // Ensure role is set in app_metadata (safety net for first login)
        await ensureUserProfile(currentSession.user.id);

        // Role comes from JWT app_metadata — no DB query needed.
        // New users fall back to 'customer' (correct); role appears in JWT on next refresh.
        const role = (currentSession.user.app_metadata?.role as UserProfile['role']) ?? 'customer';
        setUserProfile({ id: currentSession.user.id, role });
      } catch (error) {
        console.error("Error updating user profile:", error);
        // Set default customer profile on error
        setUserProfile({ id: currentSession.user.id, role: "customer" });
      }
    } else {
      setUserProfile(null);
    }
  }, [ensureUserProfile]);

  // Fetch /api/admin/impersonation/state with request dedup.
  // Safe to call often; the endpoint is explicitly designed to be poll-friendly.
  const refreshImpersonation = useCallback(async () => {
    const key = "impersonation:state";
    const existing = inflightRef.current.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const response = await fetch("/api/admin/impersonation/state", {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok) {
          if (isMountedRef.current) setImpersonation(DEFAULT_IMPERSONATION);
          return;
        }
        const data = (await response.json()) as ImpersonationState;
        if (!isMountedRef.current) return;
        if (data && typeof data.active === "boolean") {
          setImpersonation({
            active: data.active,
            target: data.target ?? null,
          });
        } else {
          setImpersonation(DEFAULT_IMPERSONATION);
        }
      } catch (error) {
        console.error("Error refreshing impersonation state:", error);
        if (isMountedRef.current) setImpersonation(DEFAULT_IMPERSONATION);
      } finally {
        if (isMountedRef.current) setImpersonationReady(true);
      }
    })().finally(() => {
      inflightRef.current.delete(key);
    });

    inflightRef.current.set(key, promise);
    return promise;
  }, []);

  const stopImpersonation = useCallback(async () => {
    try {
      await fetch("/api/admin/impersonation/stop", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Error stopping impersonation:", error);
    }
    await refreshImpersonation();
  }, [refreshImpersonation]);

  useEffect(() => {
    isMountedRef.current = true;

    // Get initial session with timeout monitoring (but don't cancel the actual call)
    const getInitialSession = async () => {
      try {
        // Track if the call is taking too long (for logging only)
        let isSlow = false;
        const slowWarning = setTimeout(() => {
          isSlow = true;
          console.warn("Session check is taking longer than expected (>5s), but still waiting...");
        }, 5000);

        // Wait for the actual session result - don't cancel even if slow
        let sessionResult: { data: { session: Session | null }, error: any };
        try {
          sessionResult = await supabase.auth.getSession();
        } finally {
          clearTimeout(slowWarning);
          if (isSlow) {
            console.log("Session check completed (was slow but succeeded)");
          }
        }

        const { data: { session }, error } = sessionResult;

        // Only set session to null if there's an actual error from Supabase
        // Don't treat slow responses as errors
        if (error) {
          console.warn("Session check error:", error.message);
          if (isMountedRef.current) {
            setSession(null);
            setUser(null);
            setLoading(false);
          }
          return;
        }

        if (isMountedRef.current) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false); // Set loading to false immediately after getting session

          // Update profile asynchronously without blocking
          updateUserProfile(session).catch((profileError) => {
            console.error("Error updating user profile:", profileError);
            // Profile update failure doesn't affect auth state
          });
        }
      } catch (error) {
        console.error("Error in getInitialSession:", error);
        if (isMountedRef.current) {
          setSession(null);
          setUser(null);
          setLoading(false);
        }
      }
    };

    getInitialSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMountedRef.current) return;

      try {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false); // Set loading to false immediately

        // updateUserProfile already calls ensureUserProfile internally,
        // so we don't need a separate call here.
        // Update profile asynchronously without blocking
        updateUserProfile(session).catch((profileError) => {
          console.error("Error updating user profile in auth state change:", profileError);
          // Profile update failure doesn't affect auth state
        });
      } catch (error) {
        console.error("Error in auth state change:", error);
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [supabase, updateUserProfile]);

  // Hydrate impersonation state on mount and whenever the session user id
  // changes (login/logout). The endpoint is cheap and self-healing — it will
  // clear the cookie if it's mismatched. We reset `impersonationReady` to
  // false before the fetch so downstream hooks (cart, wishlist) wait for
  // the fresh state before reading/writing against the new effective user
  // — otherwise a stale `ready=true` from the previous session would let
  // them run a hydration pass with the wrong context.
  useEffect(() => {
    setImpersonationReady(false);
    refreshImpersonation();
  }, [session?.user?.id, refreshImpersonation]);

  // Re-hydrate when the tab regains focus — an admin may have started/exited
  // impersonation in another tab.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => {
      if (document.visibilityState === "visible") {
        refreshImpersonation();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [refreshImpersonation]);

  // Keep refs consumed by `mintAuthToken` in sync with the latest state.
  useEffect(() => {
    impersonationActiveRef.current = impersonation.active;
  }, [impersonation.active]);

  useEffect(() => {
    jwtTokenRef.current = jwtToken;
  }, [jwtToken]);

  // Session JWT lifecycle.
  //
  // The token MUST only be minted when impersonation is known to be
  // inactive — `/api/auth/generate-token` is an identity-mutation endpoint
  // that `blockIfImpersonating` refuses whenever the `acting_as` cookie is
  // present (it would be a privilege-escalation surface otherwise). So we
  // wait for `impersonationReady` before the first mint and skip the HTTP
  // call entirely whenever `impersonation.active` is true.
  //
  // When impersonation ends (active: true → false) this effect re-runs and
  // mints a fresh token automatically.
  //
  // When the user signs out (no session), we clear the token synchronously
  // without hitting the network.
  useEffect(() => {
    if (!session?.user) {
      setJwtToken(null);
      return;
    }
    if (!impersonationReady) return;
    if (impersonation.active) return;

    let cancelled = false;
    const { id, email } = session.user;
    (async () => {
      const { token } = await mintAuthToken(id, email);
      if (cancelled || !isMountedRef.current) return;
      setJwtToken((prev) => (prev === token ? prev : token));
    })();
    return () => {
      cancelled = true;
    };
  }, [
    session?.user?.id,
    session?.user?.email,
    impersonationReady,
    impersonation.active,
    mintAuthToken,
  ]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, phone?: string) => {
    const redirectUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : process.env.NEXT_PUBLIC_SITE_URL
          ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/auth/callback`
          : "http://localhost:3000/auth/callback";

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    
    // If signup is successful and user is created, create a profile with generated name
    if (!error && data.user) {
      // Call API route to create profile server-side (bypasses RLS issues)
      try {
        const response = await fetch("/api/users/create-profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: data.user.id,
            email: email,
            phone: phone,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Error creating user profile:", errorData);
          // Don't fail signup if profile creation fails, just log the error
        }
      } catch (fetchError) {
        console.error("Error calling profile init API:", fetchError);
        // Don't fail signup if profile creation fails, just log the error
      }
    }
    
    return { error };
  };

  const signInWithGoogle = useCallback(async () => {
    // Always use current origin for redirect so localhost stays localhost when testing locally.
    // Add http://localhost:3000/auth/callback to Supabase Dashboard → Auth → URL Configuration → Redirect URLs.
    const getRedirectUrl = () => {
      if (typeof window !== "undefined") {
        return `${window.location.origin}/auth/callback`;
      }
      // Server-side fallback: use localhost in development so redirects stay local
      const base =
        process.env.NODE_ENV === "development"
          ? "http://localhost:3000"
            : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      return `${base.replace(/\/$/, "")}/auth/callback`;
    };

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getRedirectUrl(),
      },
    });
    return { error };
  }, [supabase]);

  const signOut = useCallback(async () => {
    try {
      console.log("Sign out initiated...");
      // Stop impersonation BEFORE signing out so the audit `stop` event
      // can attribute the action to the still-active session user.
      try {
        await stopImpersonation();
      } catch (stopErr) {
        console.error("Error stopping impersonation during sign out:", stopErr);
      }
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error signing out:", error);
        throw error;
      }
      // Clear profile and token after sign out
      setUserProfile(null);
      setJwtToken(null);
      setImpersonation(DEFAULT_IMPERSONATION);
      console.log("Sign out successful");
      return { success: true };
    } catch (error) {
      console.error("Sign out failed:", error);
      return { success: false, error };
    }
  }, [supabase, stopImpersonation]);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      await updateUserProfile(session);
    }
  }, [session, updateUserProfile]);

  // Computed values — `isAdmin`/`isSuperAdmin` reflect the SESSION user (the
  // actor), not the effective user. Target admin powers are NOT inherited
  // during impersonation; see the design spec §Security.
  const isAuthenticated = !!user;
  const isAdmin = userProfile
    ? ["admin", "super_admin"].includes(userProfile.role)
    : false;
  const isSuperAdmin = userProfile ? userProfile.role === "super_admin" : false;

  const value: AuthContextType = {
    user,
    session,
    loading,
    userProfile,
    jwtToken,
    isAuthenticated,
    isAdmin,
    isSuperAdmin,
    impersonation,
    impersonationReady,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    refreshProfile,
    refreshImpersonation,
    stopImpersonation,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within a SupabaseAuthProvider");
  }
  return context;
}
