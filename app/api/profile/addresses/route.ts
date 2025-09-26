import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  validatePhoneNumber,
  validateFullName,
  validateAddress,
  validateCity,
  validateState,
  validatePostalCode,
} from "@/lib/utils/validation";
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

    // Try to get from cache first
    const { data: cachedAddresses, ttl, isStale } = await CacheService.getAddresses(user.id);
    
    if (cachedAddresses) {
      const headers = {
        "X-Cache-Status": isStale ? "STALE" : "HIT",
        "X-Cache-Key": CacheService.getCacheKey("ADDRESSES", user.id),
        "X-Data-Source": "REDIS_CACHE",
        "X-Cache-TTL": ttl.toString(),
      };

      // If data is stale, trigger background revalidation
      if (isStale) {
        (async () => {
          try {
            console.log(`Background revalidation for addresses: ${user.id}`);
            await refreshAddressesInBackground(user.id, supabase);
          } catch (error) {
            console.error(`Background addresses refresh failed for user ${user.id}:`, error);
          }
        })();
      }

      return NextResponse.json(cachedAddresses, { headers });
    }

    // No cache hit, fetch from database
    const { data: addresses, error } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", user.id)
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
    
    // Cache the result
    await CacheService.setAddresses(user.id, addressList);

    const headers = {
      "X-Cache-Status": "MISS",
      "X-Cache-Key": CacheService.getCacheKey("ADDRESSES", user.id),
      "X-Data-Source": "SUPABASE_DATABASE",
      "X-Cache-Set": "SUCCESS",
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

/**
 * Background refresh function for addresses stale-while-revalidate pattern
 */
async function refreshAddressesInBackground(userId: string, supabase: any): Promise<void> {
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
    const {
      address_type = "home",
      label,
      full_name,
      phone,
      address_line_1,
      address_line_2,
      city,
      state,
      postal_code,
      country = "United States",
      is_default = false,
    } = body;

    // Validate required fields
    if (!address_line_1 || !city || !state || !postal_code) {
      return NextResponse.json(
        { error: "Address line 1, city, state, and postal code are required" },
        { status: 400 }
      );
    }

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

    // Check if user has any existing addresses
    const { data: existingAddresses, error: checkError } = await supabase
      .from("user_addresses")
      .select("id")
      .eq("user_id", user.id)
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

    // If this is the user's first address, make it default
    const isFirstAddress = !existingAddresses || existingAddresses.length === 0;
    const shouldBeDefault = isFirstAddress || is_default;

    // If setting as default and not first address, unset other default addresses
    if (shouldBeDefault && !isFirstAddress) {
      const { error: unsetError } = await supabase
        .from("user_addresses")
        .update({ is_default: false })
        .eq("user_id", user.id)
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

    // Prepare address data
    const addressData = {
      user_id: user.id,
      address_type,
      label,
      full_name,
      phone,
      address_line_1,
      address_line_2,
      city,
      state,
      postal_code,
      country,
      is_default: shouldBeDefault,
      is_active: true,
    };

    // Insert new address
    const { data, error } = await supabase
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

    // Clear addresses cache since we added a new address
    await CacheService.clearAddresses(user.id);

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/profile/addresses:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
