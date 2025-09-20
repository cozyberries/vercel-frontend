import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { authenticateRequest, isAdminUser } from "@/lib/jwt-auth";

export async function GET(request: NextRequest) {
  try {
    // Authenticate the request using JWT
    const auth = await authenticateRequest(request);

    if (!auth.isAuthenticated || !auth.isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const supabase = await createServerSupabaseClient();

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Use the admin function to get auth.users data
    const { data: authUsers, error: authUsersError } = await supabase.rpc(
      "get_auth_users",
      {
        limit_count: limit,
        offset_count: offset,
      }
    );

    if (authUsersError) {
      console.error("Error fetching auth users:", authUsersError);
      return NextResponse.json(
        { error: "Failed to fetch users: " + authUsersError.message },
        { status: 500 }
      );
    }

    // Get user profiles to combine with auth data
    const userIds = authUsers?.map((user) => user.id) || [];
    const { data: profiles, error: profilesError } = await supabase
      .from("user_profiles")
      .select("*")
      .in("id", userIds);

    if (profilesError) {
      console.error("Error fetching user profiles:", profilesError);
      return NextResponse.json(
        { error: "Failed to fetch user profiles" },
        { status: 500 }
      );
    }

    // Get order statistics for each user
    const { data: orderStats, error: orderStatsError } = await supabase
      .from("orders")
      .select("user_id, total_amount")
      .in("user_id", userIds);

    // Create user statistics map
    const userStatsMap = new Map();
    orderStats?.forEach((order) => {
      const userId = order.user_id;
      if (!userStatsMap.has(userId)) {
        userStatsMap.set(userId, { order_count: 0, total_spent: 0 });
      }
      const stats = userStatsMap.get(userId);
      stats.order_count += 1;
      stats.total_spent += order.total_amount || 0;
    });

    // Combine all user data
    const users =
      authUsers?.map((authUser) => {
        const profile = profiles?.find((p) => p.id === authUser.id);
        const stats = userStatsMap.get(authUser.id) || {
          order_count: 0,
          total_spent: 0,
        };

        return {
          id: authUser.id,
          email: authUser.email,
          created_at: authUser.created_at,
          last_sign_in_at: authUser.last_sign_in_at,
          email_confirmed_at: authUser.email_confirmed_at,
          role: profile?.role || "customer",
          full_name: profile?.full_name,
          phone: profile?.phone,
          is_active: profile?.is_active ?? true,
          is_verified: profile?.is_verified ?? false,
          order_count: stats.order_count,
          total_spent: stats.total_spent,
          admin_notes: profile?.admin_notes,
        };
      }) || [];

    return NextResponse.json({
      users,
      total: users.length,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
