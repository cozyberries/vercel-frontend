import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { validatePhoneNumber, validateFullName } from "@/lib/utils/validation";
import CacheService from "@/lib/services/cache";

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
          setTimeout(() => reject(new Error("Cache timeout")), 500)
        ),
      ]) as { data: any; ttl: number; isStale: boolean };

      cachedProfile = cacheResult.data;
      useCache = !!cachedProfile;

      if (useCache) {
        const headers = {
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

    // Prepare profile data
    const profileData = {
      id: user.id,
      full_name: full_name || user.user_metadata?.full_name || null,
      phone: phone || null,
      updated_at: new Date().toISOString(),
    };

    // Upsert profile data (insert or update)
    const { data, error } = await supabase
      .from("profiles")
      .upsert([profileData])
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

    // Update cache with the new profile data
    const updatedUserData = {
      id: user.id,
      email: user.email,
      full_name: data.full_name || user.user_metadata?.full_name || null,
      avatar_url: user.user_metadata?.avatar_url || data.avatar_url || null,
      phone: data.phone || null,
      created_at: user.created_at,
      updated_at: data.updated_at,
    };
    
    await CacheService.setProfile(user.id, updatedUserData);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in PUT /api/profile:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
