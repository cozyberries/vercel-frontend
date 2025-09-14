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

    // Check if user has multiple addresses
    const { data: userAddresses, error: countError } = await supabase
      .from("user_addresses")
      .select("id, is_default")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (countError) {
      console.error("Error checking user addresses:", countError);
      return NextResponse.json(
        {
          error: "Failed to check user addresses",
          details: countError.message,
        },
        { status: 500 }
      );
    }

    // If trying to unset default and this is the only address, prevent it
    if (!is_default && userAddresses.length === 1) {
      return NextResponse.json(
        {
          error:
            "Cannot unset default status - you must have at least one default address",
        },
        { status: 400 }
      );
    }

    // If trying to unset default and this is currently the default address
    const currentAddress = userAddresses.find((addr) => addr.id === params.id);
    if (!is_default && currentAddress?.is_default) {
      // Check if there are other addresses that can be default
      const otherAddresses = userAddresses.filter(
        (addr) => addr.id !== params.id
      );
      if (otherAddresses.length === 0) {
        return NextResponse.json(
          {
            error:
              "Cannot unset default status - you must have at least one default address",
          },
          { status: 400 }
        );
      }
    }

    // If setting as default, unset other default addresses first
    if (is_default) {
      const { error: unsetError } = await supabase
        .from("user_addresses")
        .update({ is_default: false })
        .eq("user_id", user.id)
        .eq("is_default", true)
        .neq("id", params.id); // Don't update the current address being modified

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
