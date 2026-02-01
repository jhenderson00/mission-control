import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const hasClerkKeys = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);
const signInUrl = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || "/sign-in";
const signUpUrl = process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || "/sign-up";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);
const isProtectedRoute = createRouteMatcher([
  "/",
  "/agents(.*)",
  "/tasks(.*)",
  "/graph(.*)",
]);

/**
 * Creates a new request with sanitized headers (ASCII only).
 * This prevents MIDDLEWARE_INVOCATION_FAILED errors in Next.js 16
 * when Cloudflare or other proxies add headers with accented characters
 * (e.g., cf-ipcity: Montréal).
 */
function sanitizeRequestHeaders(req: NextRequest): NextRequest {
  const sanitizedHeaders = new Headers();
  
  for (const [key, value] of req.headers.entries()) {
    // Only keep headers with ASCII-safe values
    if (/^[\x00-\x7F]*$/.test(value)) {
      sanitizedHeaders.set(key, value);
    }
  }
  
  return new NextRequest(req.url, {
    method: req.method,
    headers: sanitizedHeaders,
    body: req.body,
    // @ts-expect-error - NextRequest accepts these but types are incomplete
    duplex: "half",
  });
}

const clerkMw = hasClerkKeys
  ? clerkMiddleware(
      async (auth, req) => {
        if (isPublicRoute(req)) return;
        if (isProtectedRoute(req)) {
          await auth.protect({
            unauthenticatedUrl: signInUrl,
          });
        }
      },
      { signInUrl, signUpUrl }
    )
  : () => NextResponse.next();

export default async function middleware(req: NextRequest) {
  // Sanitize request headers before processing to avoid encoding issues
  const sanitizedReq = sanitizeRequestHeaders(req);
  return clerkMw(sanitizedReq);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
