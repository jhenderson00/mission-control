import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardPage from "@/app/(dashboard)/page";

describe("DashboardPage", () => {
  it("renders mission overview", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Mission Overview")).toBeInTheDocument();
    expect(screen.getByText("Agent Status Grid")).toBeInTheDocument();
    expect(screen.getByText("Mission Pulse")).toBeInTheDocument();
  });
});
