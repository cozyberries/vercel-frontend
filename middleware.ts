import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Redirect all requests to home page (under construction)
  // Only allow the home page and static assets
  if (request.nextUrl.pathname !== "/") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api routes (for backend functionality)
     * - static assets (images, icons, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
