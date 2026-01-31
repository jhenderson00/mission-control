import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const originalEnv = process.env.NEXT_PUBLIC_CONVEX_URL;

describe("ConvexClientProvider", () => {
  it("renders children when Convex URL is missing", async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "";
    vi.resetModules();
    const { ConvexClientProvider } = await import(
      "@/components/providers/convex-provider"
    );

    render(
      <ConvexClientProvider>
        <span>Child</span>
      </ConvexClientProvider>
    );

    expect(screen.getByText("Child")).toBeInTheDocument();
  });

  it("wraps children with provider when URL is set", async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    vi.resetModules();

    vi.doMock("convex/react", () => ({
      ConvexProvider: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="convex-provider">{children}</div>
      ),
      ConvexReactClient: class ConvexReactClientMock {
        constructor(public url: string) {
          this.url = url;
        }
      },
    }));

    const { ConvexClientProvider } = await import(
      "@/components/providers/convex-provider"
    );

    render(
      <ConvexClientProvider>
        <span>Child</span>
      </ConvexClientProvider>
    );

    expect(screen.getByTestId("convex-provider")).toBeInTheDocument();
    expect(screen.getByText("Child")).toBeInTheDocument();
  });

  afterEach(() => {
    vi.resetModules();
    vi.unmock("convex/react");
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_CONVEX_URL = originalEnv;
  });
});
