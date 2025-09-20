"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

interface UserProfile {
  id: string;
  role: 'customer' | 'admin' | 'super_admin';
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
  signOut: () => Promise<void>;
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
  const supabase = createClient();

  // Helper function to generate JWT token
  const generateJwtToken = async (userId: string, userEmail?: string) => {
    try {
      const response = await fetch('/api/auth/generate-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, userEmail }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.token;
      }
    } catch (error) {
      console.error('Error generating JWT token:', error);
    }
    return null;
  };

  // Helper function to update user profile
  const updateUserProfile = async (currentSession: Session | null) => {
    if (currentSession?.user) {
      try {
        // Get user profile with role
        const { data: profile, error } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', currentSession.user.id)
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
            role: 'customer',
          };
          setUserProfile(userProfile);
        }

        // Generate JWT token for API authentication
        const token = await generateJwtToken(currentSession.user.id, currentSession.user.email);
        setJwtToken(token);
      } catch (error) {
        console.error('Error updating user profile:', error);
        // Set default customer profile on error
        const userProfile: UserProfile = {
          id: currentSession.user.id,
          role: 'customer',
        };
        setUserProfile(userProfile);
        
        // Generate JWT token for API authentication
        const token = await generateJwtToken(currentSession.user.id, currentSession.user.email);
        setJwtToken(token);
      }
    } else {
      // No session, clear profile and token
      setUserProfile(null);
      setJwtToken(null);
    }
  };

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      
      await updateUserProfile(session);
      setLoading(false);
    };

    getInitialSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      await updateUserProfile(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { error };
  };

  const signInWithGoogle = async () => {
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
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // Clear profile and token after sign out
    setUserProfile(null);
    setJwtToken(null);
  };

  const refreshProfile = async () => {
    if (session?.user) {
      await updateUserProfile(session);
    }
  };

  // Computed values
  const isAuthenticated = !!user;
  const isAdmin = userProfile ? ['admin', 'super_admin'].includes(userProfile.role) : false;
  const isSuperAdmin = userProfile ? userProfile.role === 'super_admin' : false;

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
