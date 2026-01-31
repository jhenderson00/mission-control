"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://localhost:3210";
const hasConvexUrl = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

const convex = new ConvexReactClient(convexUrl, {
  skipConvexDeploymentUrlCheck: !hasConvexUrl,
});

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
