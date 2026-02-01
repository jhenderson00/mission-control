import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

const clerkMw = clerkMiddleware(
  async (auth, req) => {
    if (isPublicRoute(req)) return;
    if (isProtectedRoute(req)) {
      await auth.protect({
        unauthenticatedUrl: signInUrl,
      });
    }
  },
  { signInUrl, signUpUrl }
);

export default function middleware(req: NextRequest) {
  // Skip middleware entirely if Clerk is not configured
  if (!hasClerkKeys) {
    return NextResponse.next();
  }
  // Call Clerk middleware - let any errors propagate for debugging
  return clerkMw(req);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
