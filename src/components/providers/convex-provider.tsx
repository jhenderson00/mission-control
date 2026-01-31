"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const providedConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const hasConvexUrl = Boolean(providedConvexUrl);
const convexUrl =
  providedConvexUrl && providedConvexUrl.length > 0
    ? providedConvexUrl
    : "http://localhost:3210";

const convex = new ConvexReactClient(convexUrl, {
  skipConvexDeploymentUrlCheck: !hasConvexUrl,
});

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
