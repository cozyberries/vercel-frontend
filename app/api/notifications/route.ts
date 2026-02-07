import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
    try {
        const supabase = await createServerSupabaseClient();
        const body = await req.json();
        const { title, message, type } = body;
        const { data, error } = await supabase
            .from("notifications")
            .insert([{ title, message, type }])
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error creating notification:", error);
        return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
    }
}


export async function GET() {
    try {
        const supabase = await createServerSupabaseClient();
        const { data, error } = await supabase
            .from("notifications")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;
        return NextResponse.json({ notifications: data });
    } catch (error) {
        console.error("Error fetching notifications:", error);
        return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
    }
}
