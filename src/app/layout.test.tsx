import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
  Space_Grotesk: () => ({ variable: "--font-display" }),
}));

import RootLayout, { metadata, viewport } from "@/app/layout";

describe("RootLayout", () => {
  it("exports metadata and viewport", () => {
    expect(metadata.title).toBe("Mission Control");
    expect(viewport.width).toBe("device-width");
  });

  it("renders html and body structure", () => {
    const element = RootLayout({ children: <div>Child</div> }) as ReactElement;
    expect(element.type).toBe("html");
    expect(element.props.lang).toBe("en");

    const body = element.props.children as ReactElement;
    expect(body.type).toBe("body");
  });
});
