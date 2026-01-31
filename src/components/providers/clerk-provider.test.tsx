import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const originalEnv = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

describe("ClerkClientProvider", () => {
  it("renders children when publishable key is missing", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "";
    vi.resetModules();

    const { ClerkClientProvider } = await import(
      "@/components/providers/clerk-provider"
    );

    render(
      <ClerkClientProvider>
        <span>Child</span>
      </ClerkClientProvider>
    );

    expect(screen.getByText("Child")).toBeInTheDocument();
  });

  it("wraps children with ClerkProvider when key is set", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test";
    vi.resetModules();

    vi.doMock("@clerk/nextjs", () => ({
      ClerkProvider: ({ children, publishableKey }: { children: React.ReactNode; publishableKey: string }) => (
        <div data-testid="clerk-provider" data-key={publishableKey}>
          {children}
        </div>
      ),
    }));

    const { ClerkClientProvider } = await import(
      "@/components/providers/clerk-provider"
    );

    render(
      <ClerkClientProvider>
        <span>Child</span>
      </ClerkClientProvider>
    );

    const wrapper = screen.getByTestId("clerk-provider");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveAttribute("data-key", "pk_test");
    expect(screen.getByText("Child")).toBeInTheDocument();
  });

  afterEach(() => {
    vi.resetModules();
    vi.unmock("@clerk/nextjs");
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = originalEnv;
  });
});
