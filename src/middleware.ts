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
  try {
    return await clerkMw(req);
  } catch (error) {
    // Handle encoding errors from non-ASCII headers (e.g., Cloudflare cf-ipcity: Montréal)
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes("encode") ||
      errorMessage.includes("ASCII") ||
      errorMessage.includes("header")
    ) {
      console.warn("[middleware] Header encoding error, allowing request:", errorMessage);
      return NextResponse.next();
    }
    throw error;
  }
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
