import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

//  Get recent activities
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("recent_activities")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching activities:", error);
    return NextResponse.json({ error: "Failed to fetch activities" }, { status: 500 });
  }
}

// Post a new activity
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Safely parse request body
    let body;
    try {
      const text = await request.text();
      if (!text || text.trim() === '') {
        return NextResponse.json({ error: "Empty request body" }, { status: 400 });
      }
      body = JSON.parse(text);
    } catch (parseError) {
      console.error("Error parsing request body:", parseError);
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const { type, title, metadata } = body;
    if(!type || !title || !metadata) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data, error } = await supabase.from("recent_activities").insert([
      {
        type,
        title,
        metadata,
      },
    ]);

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error adding activity:", error);
    return NextResponse.json({ error: "Failed to add activity" }, { status: 500 });
  }
}
