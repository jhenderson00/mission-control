import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useAction } from "convex/react";
import { AgentStatusGrid } from "@/components/agents/agent-status-grid";
import type { AgentSummary } from "@/lib/agent-types";

const mockUseAgentStatus = vi.fn();

vi.mock("@/lib/realtime", () => ({
  useAgentStatus: (options?: { agentIds?: string[] }) =>
    mockUseAgentStatus(options),
}));

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
}));

const useActionMock = vi.mocked(useAction);

const baseAgent: AgentSummary = {
  _id: "agent_1",
  name: "Alpha",
  type: "executor",
  model: "model-1",
  status: "idle",
  host: "local",
  startedAt: Date.now(),
  currentTask: { title: "Task A" },
};

describe("CYD-133 UAT - Agent Updates", () => {
  beforeEach(() => {
    mockUseAgentStatus.mockReset();
    mockUseAgentStatus.mockReturnValue({
      statusByAgent: new Map(),
      statuses: [],
      isLoading: false,
    });
    useActionMock.mockReturnValue(vi.fn());
  });

  it("returns to active after resume updates", () => {
    const { rerender } = render(
      <AgentStatusGrid agents={[{ ...baseAgent, status: "idle" }]} />
    );

    expect(screen.getByText(/Idle\\s+1/)).toBeInTheDocument();

    rerender(<AgentStatusGrid agents={[{ ...baseAgent, status: "active" }]} />);

    expect(screen.getByText(/Active\\s+1/)).toBeInTheDocument();
  });

  it("shows a new task after redirect", () => {
    const { rerender } = render(
      <AgentStatusGrid
        agents={[{ ...baseAgent, currentTask: { title: "Investigate A" } }]}
      />
    );

    expect(screen.getByText("Investigate A")).toBeInTheDocument();

    rerender(
      <AgentStatusGrid
        agents={[{ ...baseAgent, currentTask: { title: "Investigate B" } }]}
      />
    );

    expect(screen.getByText("Investigate B")).toBeInTheDocument();
  });

  it("flags offline agents in the grid", () => {
    mockUseAgentStatus.mockReturnValue({
      statusByAgent: new Map([
        ["agent_1", { agentId: "agent_1", status: "offline" }],
      ]),
      statuses: [],
      isLoading: false,
    });

    render(<AgentStatusGrid agents={[{ ...baseAgent, status: "idle" }]} />);

    expect(screen.getByText("Offline")).toBeInTheDocument();
  });
});
