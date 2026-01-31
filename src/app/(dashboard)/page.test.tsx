import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import DashboardPage from "@/app/(dashboard)/page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useConvexConnectionState: () => ({
    isWebSocketConnected: true,
    hasEverConnected: true,
  }),
}));

const useQueryMock = vi.mocked(useQuery);
const originalEnv = process.env.NEXT_PUBLIC_CONVEX_URL;

describe("DashboardPage", () => {
  afterEach(() => {
    useQueryMock.mockReset();
    process.env.NEXT_PUBLIC_CONVEX_URL = originalEnv;
  });

  it("renders mission overview with fallback data", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "";
    render(<DashboardPage />);
    expect(screen.getByText("Mission Overview")).toBeInTheDocument();
    expect(screen.getByText("Agent Status Grid")).toBeInTheDocument();
    expect(screen.getByText("Mission Pulse")).toBeInTheDocument();
  });

  it("shows loading states when Convex data is pending", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    useQueryMock.mockReturnValue(undefined);

    render(<DashboardPage />);

    expect(screen.getByText("Loading agent telemetry...")).toBeInTheDocument();
    expect(screen.getByText("Loading mission pulse...")).toBeInTheDocument();
    expect(screen.getByText("Loading critical queue...")).toBeInTheDocument();
  });

  it("shows empty states when Convex returns no data", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";

    useQueryMock
      .mockReturnValueOnce({
        total: 0,
        active: 0,
        idle: 0,
        blocked: 0,
        failed: 0,
      })
      .mockReturnValueOnce({
        total: 0,
        queued: 0,
        active: 0,
        blocked: 0,
        completed: 0,
        failed: 0,
      })
      .mockReturnValueOnce(0)
      .mockReturnValueOnce({ error: 0 })
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    render(<DashboardPage />);

    expect(screen.getByText("No agents registered")).toBeInTheDocument();
    expect(screen.getByText("No recent activity events yet.")).toBeInTheDocument();
    expect(screen.getByText("No pending decisions yet.")).toBeInTheDocument();
  });
});
