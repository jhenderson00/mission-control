import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const hasClerkKeys = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

const clerkMw = hasClerkKeys
  ? clerkMiddleware(async (auth, req) => {
      // Only protect non-public routes
      if (!isPublicRoute(req)) {
        try {
          await auth.protect();
        } catch {
          // If auth fails, redirect to sign-in
          const signInUrl = new URL("/sign-in", req.url);
          signInUrl.searchParams.set("redirect_url", req.url);
          return NextResponse.redirect(signInUrl);
        }
      }
    })
  : null;

export default async function middleware(req: NextRequest) {
  // Skip Clerk entirely if not configured
  if (!clerkMw) {
    return NextResponse.next();
  }

  try {
    return await clerkMw(req);
  } catch (error) {
    // Log but don't crash on middleware errors
    console.error("[middleware] Error:", error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
