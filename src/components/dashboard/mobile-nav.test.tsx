import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileNav } from "@/components/dashboard/mobile-nav";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

declare global {
  var __setMockPathname: (path: string) => void;
}

describe("MobileNav", () => {
  it("toggles the menu", async () => {
    globalThis.__setMockPathname("/");
    const user = userEvent.setup();
    render(<MobileNav />);

    const openButton = screen.getByRole("button", { name: "Open menu" });
    await user.click(openButton);

    expect(screen.getByRole("navigation")).toBeInTheDocument();

    const closeButton = screen.getByRole("button", { name: "Close menu" });
    await user.click(closeButton);

    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("highlights the active route", () => {
    globalThis.__setMockPathname("/agents");
    const { getByText } = render(<MobileNav />);
    const agentsLink = getByText("Agents").closest("a");
    expect(agentsLink).toHaveAttribute("href", "/agents");
  });
});
