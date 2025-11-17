import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import CacheService from "@/lib/services/cache";

// Timeout for cache operations (in milliseconds)
const CACHE_TIMEOUT = 500; // 500ms - if cache takes longer, skip it

/**
 * Combined endpoint to fetch both profile and addresses in a single request
 * This reduces network overhead and improves performance
 */
export async function GET() {
  const startTime = Date.now();
  
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

    // Try to get both from cache with timeout
    const cachePromise = Promise.all([
      CacheService.getProfile(user.id),
      CacheService.getAddresses(user.id),
    ]);

    let cachedProfile: any = null;
    let cachedAddresses: any = null;
    let cachedProfileData: any = null;
    let cachedAddressesData: any = null;
    let useCache = false;

    try {
      // Wait for cache with timeout
      const cacheResult = await Promise.race([
        cachePromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Cache timeout")), CACHE_TIMEOUT)
        ),
      ]);

      cachedProfile = cacheResult[0];
      cachedAddresses = cacheResult[1];
      
      // Extract data from wrapper objects (consistent with individual endpoints)
      cachedProfileData = cachedProfile?.data ?? null;
      cachedAddressesData = cachedAddresses?.data ?? null;
      
      // Only use cache if both profile and addresses data are valid
      // Profile data must be truthy, addresses can be empty array but not null
      useCache = !!cachedProfileData && cachedAddressesData !== null;
    } catch (error) {
      // Cache timeout or error - proceed without cache
      console.log("Cache timeout or error, fetching from database");
    }

    // If we have cached data, return it immediately
    // Note: addresses can be an empty array, so we check if the cache result exists
    if (useCache && cachedProfile && cachedAddresses) {
      // Check if either cache result is stale
      const isStale = cachedProfile.isStale || cachedAddresses.isStale;
      
      // Trigger background refresh if stale
      if (isStale) {
        (async () => {
          try {
            await refreshDataInBackground(user.id, user, supabase);
          } catch (error) {
            console.error(`Background refresh failed for user ${user.id}:`, error);
          }
        })();
      }

      const headers = {
        "X-Cache-Status": isStale ? "STALE" : "HIT",
        "X-Data-Source": "REDIS_CACHE",
        "X-Response-Time": `${Date.now() - startTime}ms`,
      };

      return NextResponse.json(
        {
          profile: cachedProfileData,
          addresses: cachedAddressesData || [],
        },
        { headers }
      );
    }

    // No cache or cache miss - fetch from database in parallel
    const [profileData, addressesData] = await Promise.all([
      fetchProfileFromDatabase(user, supabase),
      fetchAddressesFromDatabase(user.id, supabase),
    ]);

    // Cache results asynchronously (non-blocking)
    Promise.all([
      CacheService.setProfile(user.id, profileData),
      CacheService.setAddresses(user.id, addressesData),
    ]).catch((error) => {
      console.error(`Failed to cache data for user ${user.id}:`, error);
    });

    const headers = {
      "X-Cache-Status": "MISS",
      "X-Data-Source": "SUPABASE_DATABASE",
      "X-Response-Time": `${Date.now() - startTime}ms`,
    };

    return NextResponse.json(
      {
        profile: profileData,
        addresses: addressesData,
      },
      { headers }
    );
  } catch (error) {
    console.error("Error in GET /api/profile/combined:", error);
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

  // If table doesn't exist or no profile found, return user data only
  if (profileError) {
    if (
      profileError.code === "PGRST116" ||
      profileError.message?.includes("relation") ||
      profileError.message?.includes("does not exist")
    ) {
      return {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        phone: null,
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
 * Fetch addresses from database
 */
async function fetchAddressesFromDatabase(userId: string, supabase: any) {
  const { data: addresses, error } = await supabase
    .from("user_addresses")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    // If table doesn't exist, return empty array
    if (
      error.message?.includes("relation") ||
      error.message?.includes("does not exist")
    ) {
      return [];
    }
    throw new Error(`Failed to retrieve addresses: ${error.message}`);
  }

  return addresses || [];
}

/**
 * Background refresh function for stale-while-revalidate pattern
 */
async function refreshDataInBackground(
  userId: string,
  user: any,
  supabase: any
): Promise<void> {
  try {
    const [profileData, addressesData] = await Promise.all([
      fetchProfileFromDatabase(user, supabase),
      fetchAddressesFromDatabase(userId, supabase),
    ]);

    await Promise.all([
      CacheService.setProfile(userId, profileData),
      CacheService.setAddresses(userId, addressesData),
    ]);
  } catch (error) {
    console.error("Error in background refresh:", error);
  }
}