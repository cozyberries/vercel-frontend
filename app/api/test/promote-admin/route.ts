import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
    try {
        const supabase = createAdminSupabaseClient();
        const { email } = await request.json();

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

        if (listError) {
            return NextResponse.json({ error: listError.message }, { status: 500 });
        }

        const user = users.find(u => u.email === email);

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Update user_profiles role
        const { error: updateError } = await supabase
            .from("user_profiles")
            .update({ role: "admin" })
            .eq("id", user.id);

        if (updateError) {
            // Try upsert if update fails
            const { error: upsertError } = await supabase
                .from("user_profiles")
                .upsert({
                    id: user.id,
                    role: "admin",
                    email: email,
                    updated_at: new Date().toISOString()
                });

            if (upsertError) {
                return NextResponse.json({ error: "Failed to update profile: " + upsertError.message }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true, message: `User ${email} promoted to admin` });

    } catch (error) {
        return NextResponse.json({ error: "Internal Error: " + error }, { status: 500 });
    }
}
