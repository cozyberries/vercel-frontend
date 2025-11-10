import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: profiles, error } = await supabase
      .from("user_profiles")
      .select("id, full_name");

    if (error) {
      console.error("Error fetching user profile:", error);
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 404 }
      );
    }

    const users = profiles?.map((profile) => ({
      id: profile.id,
      name: profile.full_name,
    })) || [];
    return NextResponse.json(users);

  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}
