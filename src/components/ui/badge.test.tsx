import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";

describe("Badge", () => {
  it("renders with variant data attribute", () => {
    render(<Badge variant="outline">Status</Badge>);
    const badge = screen.getByText("Status");
    expect(badge).toHaveAttribute("data-variant", "outline");
  });
});
