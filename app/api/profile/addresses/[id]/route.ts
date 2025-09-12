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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Get specific address
    const { data: address, error } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Address not found" },
          { status: 404 }
        );
      }
      console.error("Error retrieving address:", error);
      return NextResponse.json(
        { error: "Failed to retrieve address", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(address);
  } catch (error) {
    console.error("Error in GET /api/profile/addresses/[id]:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Prepare update data
    const updateData = {
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
      updated_at: new Date().toISOString(),
    };

    // Update address
    const { data, error } = await supabase
      .from("user_addresses")
      .update(updateData)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Address not found" },
          { status: 404 }
        );
      }
      console.error("Error updating address:", error);
      return NextResponse.json(
        { error: "Failed to update address", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in PUT /api/profile/addresses/[id]:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Soft delete by setting is_active to false
    const { data, error } = await supabase
      .from("user_addresses")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Address not found" },
          { status: 404 }
        );
      }
      console.error("Error deleting address:", error);
      return NextResponse.json(
        { error: "Failed to delete address", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Address deleted successfully" });
  } catch (error) {
    console.error("Error in DELETE /api/profile/addresses/[id]:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
