import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { validatePhoneNumber, validateFullName } from "@/lib/utils/validation";
import CacheService from "@/lib/services/cache";
import { notifyNewUserRegistered } from "@/lib/services/telegram";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try to get from cache first with timeout (500ms)
    let cachedProfile: any = null;
    let useCache = false;
    
    try {
      const cacheResult = await Promise.race([
        CacheService.getProfile(user.id),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Cache timeout")), 2000)
        ),
      ]) as { data: any; ttl: number; isStale: boolean };

      cachedProfile = cacheResult.data;
      useCache = !!cachedProfile;

      if (useCache) {
        const headers = {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
          "X-Cache-Status": cacheResult.isStale ? "STALE" : "HIT",
          "X-Cache-Key": CacheService.getCacheKey("PROFILE", user.id),
          "X-Data-Source": "REDIS_CACHE",
          "X-Cache-TTL": cacheResult.ttl.toString(),
        };

        // If data is stale, trigger background revalidation
        if (cacheResult.isStale) {
          (async () => {
            try {
              await refreshProfileInBackground(user.id, user, supabase);
            } catch (error) {
              console.error(`Background profile refresh failed for user ${user.id}:`, error);
            }
          })();
        }

        return NextResponse.json(cachedProfile, { headers });
      }
    } catch (error) {
      // Cache timeout or error - proceed without cache
      console.log("Cache timeout or error, fetching from database");
    }

    // No cache hit, fetch from database
    const userData = await fetchProfileFromDatabase(user, supabase);
    
    // Cache the result asynchronously (non-blocking) - don't wait for it
    CacheService.setProfile(user.id, userData).catch((error) => {
      console.error(`Failed to cache profile for user ${user.id}:`, error);
    });

    const headers = {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      "X-Cache-Status": "MISS",
      "X-Cache-Key": CacheService.getCacheKey("PROFILE", user.id),
      "X-Data-Source": "SUPABASE_DATABASE",
      "X-Cache-Set": "PENDING",
    };

    return NextResponse.json(userData, { headers });
  } catch (error) {
    console.error("Error in GET /api/profile:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

/**
 * Fetch profile data from database
 */
async function fetchProfileFromDatabase(user: any, supabase: any) {
  // Get user profile data from profiles table - only select needed fields
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, phone, avatar_url, updated_at")
    .eq("id", user.id)
    .single();

  // If table doesn't exist or no profile found, create a default profile
  if (profileError) {
    if (
      profileError.code === "PGRST116" ||
      profileError.message?.includes("relation") ||
      profileError.message?.includes("does not exist")
    ) {
      // Table doesn't exist or no profile found, return user data only
      return {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        phone: null,
        address: null,
        city: null,
        state: null,
        postal_code: null,
        country: null,
        created_at: user.created_at,
        updated_at: user.updated_at,
      };
    } else {
      throw new Error(`Failed to retrieve profile: ${profileError.message}`);
    }
  }

  // Return user data with profile information
  return {
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name || profile?.full_name || null,
    avatar_url: user.user_metadata?.avatar_url || profile?.avatar_url || null,
    phone: profile?.phone || null,
    created_at: user.created_at,
    updated_at: profile?.updated_at || user.updated_at,
  };
}

/**
 * Background refresh function for profile stale-while-revalidate pattern
 */
async function refreshProfileInBackground(userId: string, user: any, supabase: any): Promise<void> {
  try {
    const userData = await fetchProfileFromDatabase(user, supabase);
    await CacheService.setProfile(userId, userData);
  } catch (error) {
    console.error("Error in background profile refresh:", error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { full_name, phone } = body;

    // Validate input data
    if (full_name) {
      const nameValidation = validateFullName(full_name);
      if (!nameValidation.isValid) {
        return NextResponse.json(
          { error: nameValidation.error },
          { status: 400 }
        );
      }
    }

    if (phone) {
      const phoneValidation = validatePhoneNumber(phone);
      if (!phoneValidation.isValid) {
        return NextResponse.json(
          { error: phoneValidation.error },
          { status: 400 }
        );
      }
    }

    // Build the payload dynamically so that omitted fields are never overwritten.
    // upsert merges by primary key — only the columns present in the object are touched.
    const profileData: Record<string, string | null> = {
      id: user.id,
      updated_at: new Date().toISOString(),
    };

    // Only set full_name when explicitly provided so existing names are preserved
    // (e.g. complete-profile sends only phone, must not wipe the name set by create-profile)
    if (full_name !== undefined) {
      profileData.full_name = full_name || user.user_metadata?.full_name || null;
    } else if (user.user_metadata?.full_name) {
      // Carry forward metadata name on first-ever upsert (no-op if row already exists)
      profileData.full_name = user.user_metadata.full_name;
    }

    if (phone !== undefined) {
      profileData.phone = phone || null;
    }

    // Use admin client so the write always succeeds (avoids RLS blocking new users
    // whose profile was created in auth callback; middleware/GET use same profiles table)
    const adminSupabase = createAdminSupabaseClient();

    // Check existing phone before upsert to detect first-time registration.
    // Minor TOCTOU: another concurrent request could set the phone between this select
    // and the upsert below, causing a duplicate notification. Acceptable here — the
    // impact is a single extra Telegram alert. A DB trigger would eliminate it entirely.
    const { data: existingProfile } = await adminSupabase
      .from("profiles")
      .select("phone")
      .eq("id", user.id)
      .maybeSingle();
    const isFirstPhone = !existingProfile?.phone && !!phone;

    const { data, error } = await adminSupabase
      .from("profiles")
      .upsert([profileData], { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.error("Error updating profile:", error);

      // If table doesn't exist, provide helpful error message
      if (
        error.message?.includes("relation") ||
        error.message?.includes("does not exist")
      ) {
        return NextResponse.json(
          {
            error: "Profiles table not found",
            details:
              "Please run the database migration to create the profiles table. See PROFILE_SETUP.md for instructions.",
            migration_needed: true,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: "Failed to update profile", details: error.message },
        { status: 500 }
      );
    }

    // Build response shape for client/cache (Supabase returns snake_case)
    const updatedUserData = {
      id: user.id,
      email: user.email,
      full_name: data.full_name ?? user.user_metadata?.full_name ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? data.avatar_url ?? null,
      phone: data.phone ?? null,
      created_at: user.created_at,
      updated_at: data.updated_at,
    };

    // Clear then set profile cache before responding so /api/profile/combined refetch gets fresh data
    try {
      await CacheService.clearProfile(user.id);
      await CacheService.setProfile(user.id, updatedUserData);
    } catch (error) {
      console.error(`Failed to update profile cache for user ${user.id}:`, error);
    }
    if (isFirstPhone && updatedUserData.phone) {
      notifyNewUserRegistered({
        name: updatedUserData.full_name,
        email: updatedUserData.email ?? null,
        phone: updatedUserData.phone,
      });
    }
    return NextResponse.json(updatedUserData);
  } catch (error) {
    console.error("Error in PUT /api/profile:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
