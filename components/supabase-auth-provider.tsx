"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { createClient } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

interface UserProfile {
  id: string;
  role: "customer" | "admin" | "super_admin";
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
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signOut: () => Promise<{ success: boolean; error?: any }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

  // Create supabase client once and reuse it
  const [supabase] = useState(() => createClient());

  // Helper function to generate JWT token
  const generateJwtToken = useCallback(async (userId: string, userEmail?: string) => {
    try {
      const response = await fetch("/api/auth/generate-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, userEmail }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.token;
      }
    } catch (error) {
      console.error("Error generating JWT token:", error);
    }
    return null;
  }, []);

  // Helper function to update user profile
  const updateUserProfile = useCallback(async (currentSession: Session | null) => {
    if (currentSession?.user) {
      try {
        // Get user profile with role
        const { data: profile, error } = await supabase
          .from("user_profiles")
          .select("role")
          .eq("id", currentSession.user.id)
          .single();

        if (!error && profile) {
          const userProfile: UserProfile = {
            id: currentSession.user.id,
            role: profile.role,
          };
          setUserProfile(userProfile);
        } else {
          // Fallback for users without profile
          const userProfile: UserProfile = {
            id: currentSession.user.id,
            role: "customer",
          };
          setUserProfile(userProfile);
        }

        // Generate JWT token for API authentication
        const token = await generateJwtToken(
          currentSession.user.id,
          currentSession.user.email
        );
        setJwtToken(token);
      } catch (error) {
        console.error("Error updating user profile:", error);
        // Set default customer profile on error
        const userProfile: UserProfile = {
          id: currentSession.user.id,
          role: "customer",
        };
        setUserProfile(userProfile);

        // Generate JWT token for API authentication
        const token = await generateJwtToken(
          currentSession.user.id,
          currentSession.user.email
        );
        setJwtToken(token);
      }
    } else {
      // No session, clear profile and token
      setUserProfile(null);
      setJwtToken(null);
    }
  }, [supabase, generateJwtToken]);

  useEffect(() => {
    let isMounted = true;

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
          if (isMounted) {
            setSession(null);
            setUser(null);
            setLoading(false);
          }
          return;
        }

        if (isMounted) {
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
        if (isMounted) {
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
      if (!isMounted) return;

      try {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false); // Set loading to false immediately

        // Update profile asynchronously without blocking
        updateUserProfile(session).catch((profileError) => {
          console.error("Error updating user profile in auth state change:", profileError);
          // Profile update failure doesn't affect auth state
        });
      } catch (error) {
        console.error("Error in auth state change:", error);
        if (isMounted) {
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, updateUserProfile]); // supabase and updateUserProfile are stable

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    // Get the redirect URL for email confirmation
    const getRedirectUrl = () => {
      if (typeof window !== "undefined") {
        return `${window.location.origin}/auth/callback`;
      }
      return `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/auth/callback`;
    };

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getRedirectUrl(),
      },
    });

    // If signup was successful and user was created, try to create user profile
    // Note: If email confirmation is required, the profile will be created in the callback
    // If email confirmation is disabled (auto-confirm), we can create it here
    if (!error && data.user) {
      // Check if we have a session (email confirmation disabled)
      if (data.session) {
        try {
          // Create user profile via API endpoint
          const response = await fetch("/api/users/create-profile", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            console.error("Failed to create user profile:", await response.text());
            // Don't fail the signup if profile creation fails - it will be created in callback
          }
        } catch (profileError) {
          console.error("Error creating user profile:", profileError);
          // Don't fail the signup if profile creation fails
        }
      }
      // If no session (email confirmation required), profile will be created in /auth/callback
    }

    return { error };
  };

  const signInWithGoogle = useCallback(async () => {
    // Get the current domain dynamically for redirect URL
    const getRedirectUrl = () => {
      if (typeof window !== "undefined") {
        // Client-side: use current origin
        return `${window.location.origin}/auth/callback`;
      }

      // Server-side fallback (shouldn't be used for OAuth)
      return `${
        process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
      }/auth/callback`;
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
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error signing out:", error);
        throw error;
      }
      // Clear profile and token after sign out
      setUserProfile(null);
      setJwtToken(null);
      console.log("Sign out successful");
      return { success: true };
    } catch (error) {
      console.error("Sign out failed:", error);
      return { success: false, error };
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      await updateUserProfile(session);
    }
  }, [session, updateUserProfile]);

  // Computed values
  const isAuthenticated = !!user;
  const isAdmin = userProfile
    ? ["admin", "super_admin"].includes(userProfile.role)
    : false;
  const isSuperAdmin = userProfile ? userProfile.role === "super_admin" : false;

  const value = {
    user,
    session,
    loading,
    userProfile,
    jwtToken,
    isAuthenticated,
    isAdmin,
    isSuperAdmin,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    refreshProfile,
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
