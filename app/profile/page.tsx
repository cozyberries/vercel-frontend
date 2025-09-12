"use client";

import { useAuth } from "@/components/supabase-auth-provider";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ProfilePage() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-2xl md:text-3xl font-light mb-4">Not Logged In</h2>
        <p className="text-muted-foreground mb-6">
          Please log in to view your profile.
        </p>
        <Button asChild>
          <Link href="/login">Login</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 flex flex-col items-center text-center">
          <img
            src={user.user_metadata?.avatar_url || "/default-avatar.png"}
            alt={user.user_metadata?.full_name || user.email || "Profile"}
            className="w-24 h-24 rounded-full mb-6 shadow-md"
          />
          <h2 className="text-2xl md:text-3xl font-light">
            {user.user_metadata?.full_name || user.email}
          </h2>
          <p className="text-lg text-muted-foreground">{user.email}</p>

          <div className="mt-8 flex space-x-4">
            <Button
              variant="outline"
              onClick={async () => {
                await signOut();
                window.location.href = "/";
              }}
            >
              Logout
            </Button>
            <Button asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Account Info */}
      <section className="py-20 bg-[#f9f7f4]">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <h3 className="text-xl md:text-2xl font-light mb-6">
            Account Details
          </h3>
          <div className="bg-white shadow rounded-xl p-6 text-left">
            <p className="mb-4">
              <span className="font-medium">Name:</span>{" "}
              {user.user_metadata?.full_name || user.email}
            </p>
            <p className="mb-4">
              <span className="font-medium">Email:</span> {user.email}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
