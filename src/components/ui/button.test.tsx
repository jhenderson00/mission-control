import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

const Linkish = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href}>{children}</a>
);

describe("Button", () => {
  it("renders a button with data attributes", () => {
    render(<Button variant="secondary">Click</Button>);
    const button = screen.getByRole("button", { name: "Click" });
    expect(button).toHaveAttribute("data-variant", "secondary");
    expect(button).toHaveAttribute("data-size", "default");
  });

  it("renders as child when asChild is true", () => {
    render(
      <Button asChild>
        <Linkish href="/test">Go</Linkish>
      </Button>
    );
    const link = screen.getByRole("link", { name: "Go" });
    expect(link).toHaveAttribute("href", "/test");
  });
});
