import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@clerk/nextjs", () => ({
  SignUp: () => <div data-testid="sign-up-widget">Sign Up Widget</div>,
}));

const originalEnv = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

describe("SignUpPage", () => {
  it("shows a setup message when Clerk keys are missing", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "";
    vi.resetModules();

    const { default: SignUpPage } = await import(
      "@/app/sign-up/[[...sign-up]]/page"
    );

    render(<SignUpPage />);
    expect(screen.getByText("Clerk keys missing")).toBeInTheDocument();
  });

  it("renders the SignUp widget when Clerk keys are present", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test";
    vi.resetModules();

    const { default: SignUpPage } = await import(
      "@/app/sign-up/[[...sign-up]]/page"
    );

    render(<SignUpPage />);
    expect(screen.getByTestId("sign-up-widget")).toBeInTheDocument();
  });

  afterEach(() => {
    vi.resetModules();
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = originalEnv;
  });
});
