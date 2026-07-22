import { NextRequest, NextResponse } from "next/server";
import {
  effectiveUserErrorResponse,
  getEffectiveUser,
} from "@/lib/services/effective-user";

export async function GET() {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result, {
        unauthenticatedMessage: "Unauthorized",
      });
    }
    const { userId, client } = result;

    const { data, error } = await client
      .from("user_carts")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching cart:", error);
      return NextResponse.json(
        { error: "Failed to fetch cart" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { cart: data?.items || [], user_id: userId },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result, {
        unauthenticatedMessage: "Unauthorized",
      });
    }
    const { userId, client } = result;

    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items)) {
      return NextResponse.json(
        { error: "Items must be an array" },
        { status: 400 }
      );
    }

    const { data, error } = await client
      .from("user_carts")
      .upsert(
        {
          user_id: userId,
          items,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error saving cart:", error);
      return NextResponse.json(
        { error: "Failed to save cart" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      cart: data,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result, {
        unauthenticatedMessage: "Unauthorized",
      });
    }
    const { userId, client } = result;

    const { error } = await client
      .from("user_carts")
      .delete()
      .eq("user_id", userId);

    if (error) {
      console.error("Error clearing cart:", error);
      return NextResponse.json(
        { error: "Failed to clear cart" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Cart cleared successfully",
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
