import { NextRequest, NextResponse } from "next/server";
import { generateAuthToken } from "@/lib/jwt-auth";
import { blockIfImpersonating } from "@/lib/utils/impersonation-guard";

export async function POST(request: NextRequest) {
  try {
    const blocked = await blockIfImpersonating();
    if (blocked) return blocked;

    const { userId, userEmail } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Generate JWT token for the user
    const token = await generateAuthToken(userId, userEmail);

    return NextResponse.json({
      token,
      success: true,
    });
  } catch (error) {
    console.error("Error generating JWT token:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
