import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/dashboard/sidebar";

declare global {
  var __setMockPathname: (path: string) => void;
}

describe("Sidebar", () => {
  it("renders navigation items", () => {
    globalThis.__setMockPathname("/");
    render(<Sidebar />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
  });

  it("marks the active route", () => {
    globalThis.__setMockPathname("/graph");
    render(<Sidebar />);
    const graphLink = screen.getByText("Context Graph").closest("a");
    expect(graphLink).toHaveClass("bg-card/60");
  });
});
