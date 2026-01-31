import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AgentsPage from "@/app/(dashboard)/agents/page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

describe("AgentsPage", () => {
  it("renders agent overview", () => {
    render(<AgentsPage />);
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search agents, roles, missions")).toBeInTheDocument();
  });
});
