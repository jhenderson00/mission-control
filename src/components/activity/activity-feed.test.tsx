import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityFeed } from "@/components/activity/activity-feed";
import type { ActivityEvent } from "@/lib/realtime";

const mockUseActivityFeed = vi.fn();

vi.mock("@/lib/realtime", () => ({
  useActivityFeed: (options?: { limit?: number; type?: string }) =>
    mockUseActivityFeed(options),
}));

const mockEvents: ActivityEvent[] = [
  {
    _id: "event_1",
    agentId: "agent_alpha",
    createdAt: 1761931200000,
    receivedAt: 1761931205000,
    type: "chat",
    content: "Chat message received",
  },
  {
    _id: "event_2",
    agentId: "agent_beta",
    createdAt: 1761931190000,
    receivedAt: 1761931195000,
    type: "heartbeat",
    content: "Heartbeat ping detected",
  },
];

describe("ActivityFeed", () => {
  beforeEach(() => {
    mockUseActivityFeed.mockReset();
  });

  it("renders activity items", () => {
    mockUseActivityFeed.mockReturnValue({
      events: mockEvents,
      isLoading: false,
    });

    render(<ActivityFeed />);

    expect(screen.getByText("Chat message received")).toBeInTheDocument();
    expect(screen.getByText("Heartbeat ping detected")).toBeInTheDocument();
    expect(screen.getAllByText("Chat").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Heartbeat").length).toBeGreaterThan(0);
  });

  it("filters by agent and event type", async () => {
    mockUseActivityFeed.mockReturnValue({
      events: mockEvents,
      isLoading: false,
    });

    const user = userEvent.setup();
    render(<ActivityFeed />);

    const agentFilter = screen.getByRole("button", { name: /agent_beta/i });
    await user.click(agentFilter);

    expect(screen.getByText("Heartbeat ping detected")).toBeInTheDocument();
    expect(screen.queryByText("Chat message received")).not.toBeInTheDocument();

    const allAgents = screen.getByRole("button", { name: /all agents/i });
    await user.click(allAgents);

    const typeFilter = screen.getByRole("button", { name: /chat/i });
    await user.click(typeFilter);

    expect(screen.getByText("Chat message received")).toBeInTheDocument();
    expect(screen.queryByText("Heartbeat ping detected")).not.toBeInTheDocument();
  });

  it("renders empty state", () => {
    mockUseActivityFeed.mockReturnValue({
      events: [],
      isLoading: false,
    });

    render(<ActivityFeed />);
    expect(screen.getByText("No activity events yet.")).toBeInTheDocument();
  });
});
