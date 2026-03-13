import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// Helper: copy Supabase session cookies to a redirect response
function redirectWithCookies(url: URL, supabaseResponse: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
  });
  return redirectResponse;
}

export async function middleware(request: NextRequest) {
  // Fast path for API routes - skip middleware auth checks to prevent 
  // blocking parallel API fetches with redundant Supabase Auth round-trips.
  if (request.nextUrl.pathname.startsWith("/api") || request.nextUrl.pathname.startsWith("/webhook")) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  // Create Supabase client for middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect routes that require authentication
  const isProtectedRoute =
    request.nextUrl.pathname.startsWith("/profile") ||
    request.nextUrl.pathname.startsWith("/checkout") ||
    request.nextUrl.pathname.startsWith("/complete-profile");

  if (isProtectedRoute && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return redirectWithCookies(loginUrl, supabaseResponse);
  }

  // For authenticated users on protected routes (except complete-profile itself),
  // check if they have a phone number on file. Use service role so the check
  // is not blocked by RLS (profile row is written by API with admin client).
  const profilePhoneJustSaved = request.cookies.get("profile_phone_just_saved")?.value === "1";

  if (
    user &&
    (request.nextUrl.pathname.startsWith("/profile") ||
      request.nextUrl.pathname.startsWith("/checkout")) &&
    !request.nextUrl.pathname.startsWith("/complete-profile")
  ) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let profile: { phone?: string | null } | null = null;
    let profileError: { code?: string } | null = null;

    if (serviceRoleKey) {
      const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const result = await adminSupabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .single();
      profile = result.data;
      profileError = result.error;
      if (profileError) {
        console.error("Failed to fetch profile in middleware:", profileError);
      }
    } else {
      const result = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .single();
      profile = result.data;
      profileError = result.error;
      if (profileError) {
        console.error("Failed to fetch profile in middleware:", profileError);
      }
    }

    const hasPhone = !profileError && profile?.phone;
    const noProfileRow = profileError?.code === "PGRST116";
    const unexpectedError = profileError && !noProfileRow;

    if (hasPhone) {
      // Phone on file: allow through and clear the "just saved" cookie if set
      if (profilePhoneJustSaved) {
        const res = NextResponse.next({ request });
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          res.cookies.set(cookie.name, cookie.value, cookie);
        });
        res.cookies.set("profile_phone_just_saved", "", {
          path: "/",
          maxAge: 0,
        });
        return res;
      }
      return supabaseResponse;
    }

    // On unexpected DB errors, allow through rather than redirect
    if (unexpectedError) {
      console.warn("Allowing request through due to unexpected profile fetch error");
      return supabaseResponse;
    }

    if (noProfileRow || !profile?.phone) {
      // No phone: redirect to complete-profile unless they just saved (cookie set)
      if (profilePhoneJustSaved) {
        const res = NextResponse.next({ request });
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          res.cookies.set(cookie.name, cookie.value, cookie);
        });
        res.cookies.set("profile_phone_just_saved", "", { path: "/", maxAge: 0 });
        return res;
      }
      const completeProfileUrl = new URL("/complete-profile", request.url);
      completeProfileUrl.searchParams.set("redirect", request.nextUrl.pathname);
      return redirectWithCookies(completeProfileUrl, supabaseResponse);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
