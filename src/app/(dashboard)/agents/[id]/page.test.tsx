import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useAction, useQuery } from "convex/react";
import AgentDetailPage from "@/app/(dashboard)/agents/[id]/page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useAction: vi.fn(() => vi.fn()),
  useConvexConnectionState: () => ({
    isWebSocketConnected: true,
    hasEverConnected: true,
  }),
}));

const useQueryMock = vi.mocked(useQuery);
const useActionMock = vi.mocked(useAction);
const originalEnv = process.env.NEXT_PUBLIC_CONVEX_URL;

describe("AgentDetailPage", () => {
  beforeEach(() => {
    useActionMock.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    useQueryMock.mockReset();
    useActionMock.mockReset();
    process.env.NEXT_PUBLIC_CONVEX_URL = originalEnv;
  });

  it("renders details for a known agent", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "";
    render(<AgentDetailPage params={Promise.resolve({ id: "agent_1" })} />);
    expect(screen.getByText("Agent Overview")).toBeInTheDocument();
    expect(screen.getByText("Decision Log")).toBeInTheDocument();
  });

  it("renders fallback details for an unknown agent", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "";
    render(<AgentDetailPage params={Promise.resolve({ id: "missing" })} />);
    expect(screen.getByText("Agent Overview")).toBeInTheDocument();
  });

  it("shows loading state when Convex is pending", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    useQueryMock.mockReturnValue(undefined);

    render(<AgentDetailPage params={Promise.resolve({ id: "agent_1" })} />);
    expect(screen.getByText("Loading agent telemetry...")).toBeInTheDocument();
  });

  it("shows not found when Convex has no agent", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    useQueryMock
      .mockReturnValueOnce(null)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce(null);

    render(<AgentDetailPage params={Promise.resolve({ id: "missing" })} />);
    expect(screen.getByText("Agent not found")).toBeInTheDocument();
  });
});
