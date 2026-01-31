import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import TasksPage from "@/app/(dashboard)/tasks/page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useConvexConnectionState: () => ({
    isWebSocketConnected: true,
    hasEverConnected: true,
  }),
}));

const useQueryMock = vi.mocked(useQuery);
const originalEnv = process.env.NEXT_PUBLIC_CONVEX_URL;

describe("TasksPage", () => {
  afterEach(() => {
    useQueryMock.mockReset();
    process.env.NEXT_PUBLIC_CONVEX_URL = originalEnv;
  });

  it("renders task queue", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "";
    render(<TasksPage />);
    expect(screen.getByText("Task Queue")).toBeInTheDocument();
    expect(screen.getByText("Mission Pipeline")).toBeInTheDocument();
  });

  it("shows loading state when Convex is pending", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    useQueryMock.mockReturnValue(undefined);

    render(<TasksPage />);
    expect(screen.getByText("Loading task pipeline...")).toBeInTheDocument();
  });

  it("shows empty state when Convex has no tasks", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    useQueryMock.mockReturnValue([]);

    render(<TasksPage />);
    expect(screen.getByText("No tasks in the queue yet.")).toBeInTheDocument();
  });
});
