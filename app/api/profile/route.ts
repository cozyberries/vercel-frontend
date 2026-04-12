import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { validatePhoneNumber, validateFullName } from "@/lib/utils/validation";
import { findAuthUserByEmail } from "@/lib/auth-phone";
import CacheService from "@/lib/services/cache";
import { notifyNewUserRegistered } from "@/lib/services/telegram";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try to get from cache first with timeout (500ms)
    let cachedProfile: any = null;
    let useCache = false;
    
    try {
      const cacheResult = await Promise.race([
        CacheService.getProfile(user.id),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Cache timeout")), 2000)
        ),
      ]) as { data: any; ttl: number; isStale: boolean };

      cachedProfile = cacheResult.data;
      useCache = !!cachedProfile;

      if (useCache) {
        const headers = {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
          "X-Cache-Status": cacheResult.isStale ? "STALE" : "HIT",
          "X-Cache-Key": CacheService.getCacheKey("PROFILE", user.id),
          "X-Data-Source": "REDIS_CACHE",
          "X-Cache-TTL": cacheResult.ttl.toString(),
        };

        // If data is stale, trigger background revalidation
        if (cacheResult.isStale) {
          (async () => {
            try {
              await refreshProfileInBackground(user.id, user);
            } catch (error) {
              console.error(`Background profile refresh failed for user ${user.id}:`, error);
            }
          })();
        }

        return NextResponse.json(cachedProfile, { headers });
      }
    } catch (error) {
      // Cache timeout or error - proceed without cache
      console.log("Cache timeout or error, fetching from database");
    }

    // No cache hit, build from auth user
    const userData = buildProfileFromUser(user);
    
    // Cache the result asynchronously (non-blocking) - don't wait for it
    CacheService.setProfile(user.id, userData).catch((error) => {
      console.error(`Failed to cache profile for user ${user.id}:`, error);
    });

    const headers = {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      "X-Cache-Status": "MISS",
      "X-Cache-Key": CacheService.getCacheKey("PROFILE", user.id),
      "X-Data-Source": "SUPABASE_DATABASE",
      "X-Cache-Set": "PENDING",
    };

    return NextResponse.json(userData, { headers });
  } catch (error) {
    console.error("Error in GET /api/profile:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

function buildProfileFromUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone ?? null,
    full_name: user.user_metadata?.full_name ?? null,
    avatar_url: user.user_metadata?.avatar_url ?? null,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

/**
 * Background refresh function for profile stale-while-revalidate pattern
 */
async function refreshProfileInBackground(userId: string, user: any): Promise<void> {
  try {
    const userData = buildProfileFromUser(user);
    await CacheService.setProfile(userId, userData);
  } catch (error) {
    console.error("Error in background profile refresh:", error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { full_name, phone, email } = body;

    // Validate input data
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

    if (email !== undefined && email !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
      }
    }

    const adminSupabase = createAdminSupabaseClient();

    // Update email if changed
    if (email !== undefined && email !== "") {
      const existingUser = await findAuthUserByEmail(email);
      if (existingUser && existingUser.id !== user.id) {
        return NextResponse.json(
          { error: "This email address is already associated with another account." },
          { status: 409 }
        );
      }
      const { error: emailError } = await adminSupabase.auth.admin.updateUserById(user.id, {
        email,
        email_confirm: true,
      });
      if (emailError) {
        return NextResponse.json({ error: emailError.message || "Failed to update email" }, { status: 400 });
      }
    }

    // Detect first-time phone for Telegram notification
    const { data: currentAuthUser } = await adminSupabase.auth.admin.getUserById(user.id);
    const isFirstPhone = !currentAuthUser?.user?.phone && !!phone;

    // Update user_metadata (full_name)
    const userMetaUpdate: Record<string, string> = {};
    if (full_name !== undefined) {
      userMetaUpdate.full_name = full_name || user.user_metadata?.full_name || "";
    } else if (user.user_metadata?.full_name) {
      userMetaUpdate.full_name = user.user_metadata.full_name;
    }

    if (Object.keys(userMetaUpdate).length > 0) {
      await adminSupabase.auth.admin.updateUserById(user.id, { user_metadata: userMetaUpdate });
    }

    // Update phone
    if (phone !== undefined) {
      const { error: phoneError } = await adminSupabase.auth.admin.updateUserById(user.id, {
        phone: phone || "",
      });
      if (phoneError) {
        console.error("Error updating phone:", phoneError);
        return NextResponse.json({ error: "Failed to update phone" }, { status: 500 });
      }
    }

    // Fetch fresh user for response
    const { data: updatedAuthUser } = await adminSupabase.auth.admin.getUserById(user.id);
    const updatedUser = updatedAuthUser?.user;

    const updatedUserData = {
      id: user.id,
      email: (email !== undefined && email !== "") ? email : user.email,
      full_name: updatedUser?.user_metadata?.full_name ?? null,
      avatar_url: updatedUser?.user_metadata?.avatar_url ?? null,
      phone: updatedUser?.phone ?? null,
      created_at: user.created_at,
      updated_at: new Date().toISOString(),
    };

    // Clear then set profile cache before responding so /api/profile/combined refetch gets fresh data
    try {
      await CacheService.clearProfile(user.id);
      await CacheService.setProfile(user.id, updatedUserData);
    } catch (error) {
      console.error(`Failed to update profile cache for user ${user.id}:`, error);
    }
    if (isFirstPhone && updatedUserData.phone) {
      notifyNewUserRegistered({
        name: updatedUserData.full_name,
        email: updatedUserData.email ?? null,
        phone: updatedUserData.phone,
      });
    }
    return NextResponse.json(updatedUserData);
  } catch (error) {
    console.error("Error in PUT /api/profile:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
