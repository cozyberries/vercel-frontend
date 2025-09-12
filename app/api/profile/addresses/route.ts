import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { 
  validatePhoneNumber, 
  validateFullName, 
  validateAddress, 
  validateCity, 
  validateState, 
  validatePostalCode 
} from "@/lib/utils/validation";

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

    // Get user addresses
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

    return NextResponse.json(addresses || []);
  } catch (error) {
    console.error("Error in GET /api/profile/addresses:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
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
      is_default,
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

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/profile/addresses:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
