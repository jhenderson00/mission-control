import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardLayout from "@/app/(dashboard)/layout";

describe("DashboardLayout", () => {
  it("renders children within layout", () => {
    render(
      <DashboardLayout>
        <div>Child Content</div>
      </DashboardLayout>
    );

    expect(screen.getByText("Child Content")).toBeInTheDocument();
    expect(screen.getAllByText("Clawdbot Mission Control").length).toBeGreaterThan(0);
  });
});
