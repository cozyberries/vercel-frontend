import { NextRequest, NextResponse } from "next/server";
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result);
    }
    const { userId, client } = result;

    const resolvedParams = await params;
    const { data: address, error } = await client
      .from("user_addresses")
      .select("*")
      .eq("id", resolvedParams.id)
      .eq("user_id", userId)
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result);
    }
    const { userId, client } = result;

    const resolvedParams = await params;

    const body = await request.json();
    const {
      address_type,
      label,
      full_name,
      phone,
      address_line_1,
      area,
      city,
      state,
      postal_code,
      country,
      is_default,
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

    const { data: userAddresses, error: countError } = await client
      .from("user_addresses")
      .select("id, is_default")
      .eq("user_id", userId)
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

    if (!is_default && userAddresses.length === 1) {
      return NextResponse.json(
        {
          error:
            "Cannot unset default status - you must have at least one default address",
        },
        { status: 400 }
      );
    }

    const currentAddress = userAddresses.find((addr: { id: string }) => addr.id === resolvedParams.id);
    if (!is_default && currentAddress?.is_default) {
      const otherAddresses = userAddresses.filter(
        (addr: { id: string }) => addr.id !== resolvedParams.id
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

    if (is_default) {
      const { error: unsetError } = await client
        .from("user_addresses")
        .update({ is_default: false })
        .eq("user_id", userId)
        .eq("is_default", true)
        .neq("id", resolvedParams.id);

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

    const updateData = {
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
      is_default,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from("user_addresses")
      .update(updateData)
      .eq("id", resolvedParams.id)
      .eq("user_id", userId)
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

    await CacheService.clearAddresses(userId);
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result);
    }
    const { userId, client } = result;

    const resolvedParams = await params;
    const { error } = await client
      .from("user_addresses")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", resolvedParams.id)
      .eq("user_id", userId)
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

    await CacheService.clearAddresses(userId);
    return NextResponse.json({ message: "Address deleted successfully" });
  } catch (error) {
    console.error("Error in DELETE /api/profile/addresses/[id]:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
