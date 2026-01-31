import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const hasClerkKeys = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);
const isProtectedRoute = createRouteMatcher([
  "/",
  "/agents(.*)",
  "/tasks(.*)",
  "/graph(.*)",
]);

const middleware = hasClerkKeys
  ? clerkMiddleware(async (auth, req) => {
      if (isPublicRoute(req)) return;
      if (isProtectedRoute(req)) {
        await auth.protect();
      }
    })
  : () => NextResponse.next();

export default middleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
