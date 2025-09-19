"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import { UserPayload, AnonymousUserPayload, generateAnonymousToken, verifyToken, generateAuthToken } from "@/lib/jwt-auth";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userProfile: UserPayload | AnonymousUserPayload | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  jwtToken: string | null;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<void>;
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
  const [userProfile, setUserProfile] = useState<UserPayload | AnonymousUserPayload | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const supabase = createClient();

  // Helper function to update user profile and JWT token
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
          // Generate JWT token for authenticated user
          const token = await generateAuthToken(currentSession.user.id, currentSession.user.email);
          setJwtToken(token);
          
          const userPayload: UserPayload = {
            id: currentSession.user.id,
            email: currentSession.user.email,
            role: profile.role,
            isAnonymous: false,
          };
          setUserProfile(userPayload);
        } else {
          // Fallback for users without profile
          const token = await generateAuthToken(currentSession.user.id, currentSession.user.email);
          setJwtToken(token);
          
          const userPayload: UserPayload = {
            id: currentSession.user.id,
            email: currentSession.user.email,
            role: 'customer',
            isAnonymous: false,
          };
          setUserProfile(userPayload);
        }
      } catch (error) {
        console.error('Error updating user profile:', error);
        // Set anonymous user on error
        const anonymousToken = generateAnonymousToken();
        setJwtToken(anonymousToken);
        const anonymousUser = verifyToken(anonymousToken) as AnonymousUserPayload;
        setUserProfile(anonymousUser);
      }
    } else {
      // No session, create anonymous user
      const anonymousToken = generateAnonymousToken();
      setJwtToken(anonymousToken);
      const anonymousUser = verifyToken(anonymousToken) as AnonymousUserPayload;
      setUserProfile(anonymousUser);
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
    // After sign out, create anonymous user
    const anonymousToken = generateAnonymousToken();
    setJwtToken(anonymousToken);
    const anonymousUser = verifyToken(anonymousToken) as AnonymousUserPayload;
    setUserProfile(anonymousUser);
  };

  const refreshToken = async () => {
    if (session?.user) {
      await updateUserProfile(session);
    }
  };

  // Computed values
  const isAuthenticated = userProfile ? !userProfile.isAnonymous : false;
  const isAdmin = userProfile ? !userProfile.isAnonymous && ['admin', 'super_admin'].includes(userProfile.role) : false;
  const isSuperAdmin = userProfile ? !userProfile.isAnonymous && userProfile.role === 'super_admin' : false;

  const value = {
    user,
    session,
    loading,
    userProfile,
    isAuthenticated,
    isAdmin,
    isSuperAdmin,
    jwtToken,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    refreshToken,
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
