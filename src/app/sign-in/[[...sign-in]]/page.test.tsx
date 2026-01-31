import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@clerk/nextjs", () => ({
  SignIn: () => <div data-testid="sign-in-widget">Sign In Widget</div>,
}));

const originalEnv = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

describe("SignInPage", () => {
  it("shows a setup message when Clerk keys are missing", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "";
    vi.resetModules();

    const { default: SignInPage } = await import(
      "@/app/sign-in/[[...sign-in]]/page"
    );

    render(<SignInPage />);
    expect(screen.getByText("Clerk keys missing")).toBeInTheDocument();
  });

  it("renders the SignIn widget when Clerk keys are present", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test";
    vi.resetModules();

    const { default: SignInPage } = await import(
      "@/app/sign-in/[[...sign-in]]/page"
    );

    render(<SignInPage />);
    expect(screen.getByTestId("sign-in-widget")).toBeInTheDocument();
  });

  afterEach(() => {
    vi.resetModules();
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = originalEnv;
  });
});
