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

        const { data, error: updateError } = await supabase.auth.admin.updateUserById(
            user.id,
            { email_confirm: true }
        );

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: `User ${email} verified`, user: data });

    } catch (error) {
        return NextResponse.json({ error: "Internal Error: " + error }, { status: 500 });
    }
}
