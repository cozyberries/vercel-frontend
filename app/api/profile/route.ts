import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { validatePhoneNumber, validateFullName } from "@/lib/utils/validation";
import { findAuthUserByEmail } from "@/lib/auth-phone";
import CacheService from "@/lib/services/cache";
import { notifyNewUserRegistered } from "@/lib/services/telegram";
import {
  effectiveUserErrorResponse,
  getEffectiveUser,
} from "@/lib/services/effective-user";

export async function GET() {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result);
    }
    const { userId, effectiveUser } = result;

    let cachedProfile: any = null;
    let useCache = false;

    try {
      const cacheResult = (await Promise.race([
        CacheService.getProfile(userId),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Cache timeout")), 2000)
        ),
      ])) as { data: any; ttl: number; isStale: boolean };

      cachedProfile = cacheResult.data;
      useCache = !!cachedProfile;

      if (useCache) {
        const headers = {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
          "X-Cache-Status": cacheResult.isStale ? "STALE" : "HIT",
          "X-Cache-Key": CacheService.getCacheKey("PROFILE", userId),
          "X-Data-Source": "REDIS_CACHE",
          "X-Cache-TTL": cacheResult.ttl.toString(),
        };

        if (cacheResult.isStale) {
          (async () => {
            try {
              await refreshProfileInBackground(userId, effectiveUser);
            } catch (error) {
              console.error(`Background profile refresh failed for user ${userId}:`, error);
            }
          })();
        }

        return NextResponse.json(cachedProfile, { headers });
      }
    } catch (error) {
      console.log("Cache timeout or error, fetching from database");
    }

    const userData = buildProfileFromUser(effectiveUser);

    CacheService.setProfile(userId, userData).catch((error) => {
      console.error(`Failed to cache profile for user ${userId}:`, error);
    });

    const headers = {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      "X-Cache-Status": "MISS",
      "X-Cache-Key": CacheService.getCacheKey("PROFILE", userId),
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

function buildProfileFromUser(user: User) {
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

async function refreshProfileInBackground(userId: string, user: User): Promise<void> {
  try {
    const userData = buildProfileFromUser(user);
    await CacheService.setProfile(userId, userData);
  } catch (error) {
    console.error("Error in background profile refresh:", error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result);
    }
    const { userId, actingAdminId, effectiveUser } = result;

    const body = await request.json();
    const { full_name, phone, email } = body;

    // Identity-mutating fields (email, password, role) MUST be blocked while
    // an admin is acting on behalf of another user. Only data fields (phone,
    // full_name) may flow through.
    if (actingAdminId !== null && email !== undefined && email !== "") {
      return NextResponse.json(
        {
          error: "Identity changes not permitted while acting as another user",
          field: "email",
        },
        { status: 403 }
      );
    }

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

    if (email !== undefined && email !== "") {
      const existingUser = await findAuthUserByEmail(email);
      if (existingUser && existingUser.id !== userId) {
        return NextResponse.json(
          { error: "This email address is already associated with another account." },
          { status: 409 }
        );
      }
    }

    // Detect first-time phone for Telegram notification against the target.
    const { data: currentAuthUser } = await adminSupabase.auth.admin.getUserById(userId);
    const isFirstPhone = !currentAuthUser?.user?.phone && !!phone;

    const updatePayload: Record<string, any> = {};

    if (email !== undefined && email !== "") {
      updatePayload.email = email;
      updatePayload.email_confirm = true;
    }

    const userMetaUpdate: Record<string, string> = {};
    if (full_name !== undefined) {
      userMetaUpdate.full_name = full_name || effectiveUser.user_metadata?.full_name || "";
    } else if (effectiveUser.user_metadata?.full_name) {
      userMetaUpdate.full_name = effectiveUser.user_metadata.full_name;
    }
    if (Object.keys(userMetaUpdate).length > 0) {
      updatePayload.user_metadata = userMetaUpdate;
    }

    if (phone !== undefined) {
      updatePayload.phone = phone || "";
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await adminSupabase.auth.admin.updateUserById(
        userId,
        updatePayload
      );
      if (updateError) {
        console.error("Error updating profile:", updateError);
        return NextResponse.json(
          { error: updateError.message || "Failed to update profile" },
          { status: 500 }
        );
      }
    }

    const { data: updatedAuthUser } = await adminSupabase.auth.admin.getUserById(userId);
    const updatedUser = updatedAuthUser?.user;

    const updatedUserData = {
      id: userId,
      email: (email !== undefined && email !== "") ? email : effectiveUser.email,
      full_name: updatedUser?.user_metadata?.full_name ?? null,
      avatar_url: updatedUser?.user_metadata?.avatar_url ?? null,
      phone: updatedUser?.phone ?? null,
      created_at: effectiveUser.created_at,
      updated_at: new Date().toISOString(),
    };

    try {
      await CacheService.clearProfile(userId);
      await CacheService.setProfile(userId, updatedUserData);
    } catch (error) {
      console.error(`Failed to update profile cache for user ${userId}:`, error);
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
