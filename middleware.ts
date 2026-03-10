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
    return redirectWithCookies(new URL("/login", request.url), supabaseResponse);
  }

  // For authenticated users on protected routes (except complete-profile itself),
  // check if they have a phone number on file. Use service role so the check
  // is not blocked by RLS (profile row is written by API with admin client).
  if (
    user &&
    (request.nextUrl.pathname.startsWith("/profile") ||
      request.nextUrl.pathname.startsWith("/checkout")) &&
    !request.nextUrl.pathname.startsWith("/complete-profile")
  ) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey) {
      const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data: profile, error: profileError } = await adminSupabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .single();

      if (!profileError && !profile?.phone) {
        return redirectWithCookies(new URL("/complete-profile", request.url), supabaseResponse);
      }
      if (profileError) {
        console.error("Failed to fetch profile in middleware:", profileError);
      }
    } else {
      // Fallback: use anon client (works only if RLS allows SELECT on own row)
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("Failed to fetch profile in middleware:", profileError);
        return supabaseResponse;
      }
      if (!profile?.phone) {
        return redirectWithCookies(new URL("/complete-profile", request.url), supabaseResponse);
      }
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
