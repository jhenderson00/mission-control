import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import AgentsPage from "@/app/(dashboard)/agents/page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

const useQueryMock = vi.mocked(useQuery);
const originalEnv = process.env.NEXT_PUBLIC_CONVEX_URL;

describe("AgentsPage", () => {
  afterEach(() => {
    useQueryMock.mockReset();
    process.env.NEXT_PUBLIC_CONVEX_URL = originalEnv;
  });

  it("renders agent overview", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "";
    render(<AgentsPage />);
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search agents, roles, missions")
    ).toBeInTheDocument();
  });

  it("shows loading state when Convex is pending", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    useQueryMock.mockReturnValue(undefined);

    render(<AgentsPage />);
    expect(screen.getByText("Loading agents...")).toBeInTheDocument();
  });

  it("shows empty state when Convex has no agents", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    useQueryMock.mockReturnValue([]);

    render(<AgentsPage />);
    expect(screen.getByText("No agents registered")).toBeInTheDocument();
  });
});
