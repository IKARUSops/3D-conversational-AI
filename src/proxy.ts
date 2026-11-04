/**
 * Next.js 16 Proxy (formerly Middleware).
 *
 * 1. Two domains, one Vercel project (owner decision): when the request host equals PORTAL_HOST
 *    (for example `bytevoice-bangla-portal.vercel.app`), `/` redirects to `/portal`.
 *    The landing host serves `/` and also `/portal`, so both links work.
 * 2. Portal session refresh (T3.1): on /portal/* the Supabase auth cookie is refreshed so
 *    Server Components always see a valid session. Skipped when Supabase env is not set.
 *    Authorisation itself happens in requireStaff() (src/lib/auth.ts), not here.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { portalRedirectPath } from "@/lib/host-redirect";

export async function proxy(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const target = portalRedirectPath(host, request.nextUrl.pathname, process.env.PORTAL_HOST);
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url, 307);
  }

  if (request.nextUrl.pathname.startsWith("/portal")) {
    return refreshSupabaseSession(request);
  }
  return NextResponse.next();
}

async function refreshSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !anonKey) return response;

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });
    // getUser() validates the token with Supabase and refreshes it when needed.
    await supabase.auth.getUser();
  } catch (err) {
    console.error("[proxy] session refresh failed", err);
  }
  return response;
}

export const config = {
  matcher: ["/", "/portal/:path*"],
};
