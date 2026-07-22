import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import CacheService from "@/lib/services/cache";
import {
  effectiveUserErrorResponse,
  getEffectiveUser,
} from "@/lib/services/effective-user";

// 2s - Upstash REST API can be slow from non-edge environments
const CACHE_TIMEOUT = 2000;

/**
 * Combined endpoint to fetch both profile and addresses in a single request
 * This reduces network overhead and improves performance
 */
export async function GET() {
  const startTime = Date.now();

  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result);
    }
    const { userId, client, effectiveUser } = result;

    const cachePromise = Promise.all([
      CacheService.getProfile(userId),
      CacheService.getAddresses(userId),
    ]);

    let cachedProfile: any = null;
    let cachedAddresses: any = null;
    let cachedProfileData: any = null;
    let cachedAddressesData: any = null;
    let useCache = false;

    try {
      const cacheResult = await Promise.race([
        cachePromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Cache timeout")), CACHE_TIMEOUT)
        ),
      ]);

      cachedProfile = cacheResult[0];
      cachedAddresses = cacheResult[1];

      cachedProfileData = cachedProfile?.data ?? null;
      cachedAddressesData = cachedAddresses?.data ?? null;

      // Only use cache if both profile and addresses data are valid.
      // Addresses can legitimately be an empty array but must not be null.
      useCache = !!cachedProfileData && cachedAddressesData !== null;
    } catch (error) {
      console.log("Cache timeout or error, fetching from database");
    }

    if (useCache && cachedProfile && cachedAddresses) {
      const isStale = cachedProfile.isStale || cachedAddresses.isStale;

      if (isStale) {
        (async () => {
          try {
            await refreshDataInBackground(userId, effectiveUser, client);
          } catch (error) {
            console.error(`Background refresh failed for user ${userId}:`, error);
          }
        })();
      }

      const headers = {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
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

    const profileData = buildProfileFromUser(effectiveUser);
    const addressesData = await fetchAddressesFromDatabase(userId, client);

    Promise.all([
      CacheService.setProfile(userId, profileData),
      CacheService.setAddresses(userId, addressesData),
    ]).catch((error) => {
      console.error(`Failed to cache data for user ${userId}:`, error);
    });

    const headers = {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
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

function buildProfileFromUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone ?? null,
    full_name: user.user_metadata?.full_name ?? null,
    avatar_url: user.user_metadata?.avatar_url ?? null,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

async function fetchAddressesFromDatabase(userId: string, supabase: SupabaseClient) {
  const { data: addresses, error } = await supabase
    .from("user_addresses")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
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

async function refreshDataInBackground(
  userId: string,
  user: User,
  supabase: SupabaseClient
): Promise<void> {
  try {
    const profileData = buildProfileFromUser(user);
    const addressesData = await fetchAddressesFromDatabase(userId, supabase);

    await Promise.all([
      CacheService.setProfile(userId, profileData),
      CacheService.setAddresses(userId, addressesData),
    ]);
  } catch (error) {
    console.error("Error in background refresh:", error);
  }
}
