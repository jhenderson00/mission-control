import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Separator } from "@/components/ui/separator";

describe("Separator", () => {
  it("renders with data-slot", () => {
    const { container } = render(<Separator />);
    const separator = container.querySelector("[data-slot='separator']");
    expect(separator).toBeInTheDocument();
  });

  it("supports vertical orientation", () => {
    const { container } = render(<Separator orientation="vertical" />);
    const separator = container.querySelector("[data-slot='separator']");
    expect(separator).toHaveAttribute("data-orientation", "vertical");
  });
});
