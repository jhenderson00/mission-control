import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

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
 * Sanitizes response headers by removing non-ASCII characters.
 * This prevents MIDDLEWARE_INVOCATION_FAILED errors in Next.js 16
 * when Cloudflare or other proxies add headers with accented characters.
 */
function sanitizeHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of response.headers.entries()) {
    // Check if header value contains non-ASCII characters
    if (!/^[\x00-\x7F]*$/.test(value)) {
      response.headers.delete(key);
    }
  }
  return response;
}

const middleware = hasClerkKeys
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

export default async function wrappedMiddleware(
  ...args: Parameters<typeof middleware>
) {
  const response = await middleware(...args);
  
  // Apply header sanitization if we got a response
  if (response instanceof NextResponse) {
    return sanitizeHeaders(response);
  }
  
  return response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
