import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import GraphPage from "@/app/(dashboard)/graph/page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useAction: vi.fn(),
  useConvexConnectionState: () => ({
    isWebSocketConnected: true,
    hasEverConnected: true,
  }),
}));

const useQueryMock = vi.mocked(useQuery);
const originalEnv = process.env.NEXT_PUBLIC_CONVEX_URL;

describe("GraphPage", () => {
  afterEach(() => {
    useQueryMock.mockReset();
    process.env.NEXT_PUBLIC_CONVEX_URL = originalEnv;
  });

  it("renders graph view", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "";
    render(<GraphPage />);
    expect(screen.getByText("Context Graph")).toBeInTheDocument();
    expect(screen.getByText("Graph View")).toBeInTheDocument();
  });

  it("shows loading state when Convex is pending", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    useQueryMock.mockReturnValue(undefined);

    render(<GraphPage />);
    expect(screen.getByText("Loading graph nodes...")).toBeInTheDocument();
  });

  it("shows empty state when Convex has no decisions", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    useQueryMock.mockReturnValue([]);

    render(<GraphPage />);
    expect(screen.getByText("No decision nodes available yet.")).toBeInTheDocument();
  });
});
