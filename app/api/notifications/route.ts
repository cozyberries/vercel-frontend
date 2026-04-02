import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createServerSupabaseClient,
  createAdminSupabaseClient,
} from "@/lib/supabase-server";

/**
 * Auth with the user-scoped client; read/write notifications with the admin client
 * scoped by `user_id`. Avoids `GRANT ... TO authenticated` drift across Supabase projects.
 */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = await createServerSupabaseClient(cookieStore);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { title, message, type } = body;

    if (
      typeof title !== "string" ||
      title.trim() === "" ||
      typeof message !== "string" ||
      message.trim() === ""
    ) {
      return NextResponse.json(
        { error: "title and message are required strings" },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();

    const { data, error } = await admin
      .from("notifications")
      .insert([
        {
          user_id: user.id,
          title: title.trim(),
          message: message.trim(),
          type: typeof type === "string" && type.trim() ? type.trim() : "info",
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Supabase notification insert:", error.code, error.message, error.details);
      const dev = process.env.NODE_ENV === "development";
      return NextResponse.json(
        {
          error: "Failed to create notification",
          ...(dev && {
            supabaseCode: error.code,
            supabaseMessage: error.message,
          }),
        },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating notification:", error);
    const dev = process.env.NODE_ENV === "development";
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Failed to create notification",
        ...(dev && { hint: msg }),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = await createServerSupabaseClient(cookieStore);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ notifications: [] });
    }

    const admin = createAdminSupabaseClient();

    const { data, error } = await admin
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase notification list:", error.code, error.message);
      throw error;
    }

    return NextResponse.json({ notifications: data ?? [] });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}
