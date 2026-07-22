import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validatePhoneNumber,
  validateFullName,
  validateAddress,
  validateCity,
  validateState,
  validatePostalCode,
} from "@/lib/utils/validation";
import CacheService from "@/lib/services/cache";
import {
  effectiveUserErrorResponse,
  getEffectiveUser,
} from "@/lib/services/effective-user";

export async function GET() {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result);
    }
    const { userId, client } = result;

    let cachedAddresses: any = null;
    let useCache = false;

    try {
      const cacheResult = (await Promise.race([
        CacheService.getAddresses(userId),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Cache timeout")), 2000)
        ),
      ])) as { data: any; ttl: number; isStale: boolean };

      cachedAddresses = cacheResult.data;
      useCache = cachedAddresses !== null;

      if (useCache) {
        const headers = {
          "X-Cache-Status": cacheResult.isStale ? "STALE" : "HIT",
          "X-Cache-Key": CacheService.getCacheKey("ADDRESSES", userId),
          "X-Data-Source": "REDIS_CACHE",
          "X-Cache-TTL": cacheResult.ttl.toString(),
        };

        if (cacheResult.isStale) {
          (async () => {
            try {
              await refreshAddressesInBackground(userId, client);
            } catch (error) {
              console.error(`Background addresses refresh failed for user ${userId}:`, error);
            }
          })();
        }

        return NextResponse.json(cachedAddresses, { headers });
      }
    } catch (error) {
      console.log("Cache timeout or error, fetching from database");
    }

    const { data: addresses, error } = await client
      .from("user_addresses")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error retrieving addresses:", error);
      return NextResponse.json(
        { error: "Failed to retrieve addresses", details: error.message },
        { status: 500 }
      );
    }

    const addressList = addresses || [];

    CacheService.setAddresses(userId, addressList).catch((error) => {
      console.error(`Failed to cache addresses for user ${userId}:`, error);
    });

    const headers = {
      "X-Cache-Status": "MISS",
      "X-Cache-Key": CacheService.getCacheKey("ADDRESSES", userId),
      "X-Data-Source": "SUPABASE_DATABASE",
      "X-Cache-Set": "PENDING",
    };

    return NextResponse.json(addressList, { headers });
  } catch (error) {
    console.error("Error in GET /api/profile/addresses:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

async function refreshAddressesInBackground(
  userId: string,
  supabase: SupabaseClient
): Promise<void> {
  try {
    const { data: addresses, error } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error in background addresses refresh:", error);
      return;
    }

    await CacheService.setAddresses(userId, addresses || []);
  } catch (error) {
    console.error("Error in background addresses refresh:", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result);
    }
    const { userId, client } = result;

    const body = await request.json();
    const {
      address_type = "home",
      label,
      full_name,
      phone,
      address_line_1,
      area,
      city,
      state,
      postal_code,
      country = "United States",
      is_default = false,
    } = body;

    if (!address_line_1 || !city || !state || !postal_code) {
      return NextResponse.json(
        { error: "Address line 1, city, state, and postal code are required" },
        { status: 400 }
      );
    }

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

    const addressValidation = validateAddress(address_line_1);
    if (!addressValidation.isValid) {
      return NextResponse.json(
        { error: addressValidation.error },
        { status: 400 }
      );
    }

    const cityValidation = validateCity(city);
    if (!cityValidation.isValid) {
      return NextResponse.json(
        { error: cityValidation.error },
        { status: 400 }
      );
    }

    const stateValidation = validateState(state);
    if (!stateValidation.isValid) {
      return NextResponse.json(
        { error: stateValidation.error },
        { status: 400 }
      );
    }

    const postalCodeValidation = validatePostalCode(postal_code, country);
    if (!postalCodeValidation.isValid) {
      return NextResponse.json(
        { error: postalCodeValidation.error },
        { status: 400 }
      );
    }

    const { data: existingAddresses, error: checkError } = await client
      .from("user_addresses")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (checkError) {
      console.error("Error checking existing addresses:", checkError);
      return NextResponse.json(
        {
          error: "Failed to check existing addresses",
          details: checkError.message,
        },
        { status: 500 }
      );
    }

    const isFirstAddress = !existingAddresses || existingAddresses.length === 0;
    const shouldBeDefault = isFirstAddress || is_default;

    if (shouldBeDefault && !isFirstAddress) {
      const { error: unsetError } = await client
        .from("user_addresses")
        .update({ is_default: false })
        .eq("user_id", userId)
        .eq("is_default", true);

      if (unsetError) {
        console.error("Error unsetting previous default address:", unsetError);
        return NextResponse.json(
          {
            error: "Failed to update previous default address",
            details: unsetError.message,
          },
          { status: 500 }
        );
      }
    }

    const addressData = {
      user_id: userId,
      address_type,
      label,
      full_name,
      phone,
      address_line_1,
      area: area ?? null,
      city,
      state,
      postal_code,
      country,
      is_default: shouldBeDefault,
      is_active: true,
    };

    const { data, error } = await client
      .from("user_addresses")
      .insert([addressData])
      .select()
      .single();

    if (error) {
      console.error("Error creating address:", error);
      return NextResponse.json(
        { error: "Failed to create address", details: error.message },
        { status: 500 }
      );
    }

    await CacheService.clearAddresses(userId);

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/profile/addresses:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
