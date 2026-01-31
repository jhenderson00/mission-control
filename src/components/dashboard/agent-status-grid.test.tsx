import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentStatusGrid } from "@/components/dashboard/agent-status-grid";
import type { AgentSummary } from "@/lib/agent-types";

vi.mock("@/lib/realtime", () => ({
  useAgentStatus: () => ({
    statusByAgent: new Map(),
    statuses: [],
    isLoading: false,
  }),
}));

describe("AgentStatusGrid", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders empty state", () => {
    render(<AgentStatusGrid agents={[]} />);
    expect(screen.getByText("No agents registered")).toBeInTheDocument();
  });

  it("renders status counts and sections", () => {
    const agents: AgentSummary[] = [
      {
        _id: "agent_1",
        name: "Alpha",
        type: "executor",
        model: "model-1",
        status: "active",
        currentTask: { title: "Task A" },
        startedAt: Date.now() - 5 * 60 * 1000,
        host: "local",
      },
      {
        _id: "agent_2",
        name: "Beta",
        type: "planner",
        model: "model-2",
        status: "idle",
        host: "local",
      },
    ];

    render(<AgentStatusGrid agents={agents} />);

    expect(
      screen.getAllByText((_, element) => element?.textContent === "Active 1").length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, element) => element?.textContent === "Idle 1").length
    ).toBeGreaterThan(0);
    expect(screen.getByText("Active Agents")).toBeInTheDocument();
    expect(screen.getByText("Standby")).toBeInTheDocument();
  });
});
