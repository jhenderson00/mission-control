import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAction, useQuery } from "convex/react";
import { AgentStatusGrid } from "@/components/agents/agent-status-grid";
import type { AgentSummary } from "@/lib/agent-types";

const mockUseAgentStatus = vi.fn();

vi.mock("@/lib/realtime", () => ({
  useAgentStatus: (options?: { agentIds?: string[] }) =>
    mockUseAgentStatus(options),
}));

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
  useQuery: vi.fn(),
}));

const useActionMock = vi.mocked(useAction);
const useQueryMock = vi.mocked(useQuery);

const agents: AgentSummary[] = [
  {
    _id: "agent_1",
    name: "Alpha",
    type: "executor",
    model: "model-1",
    status: "active",
    currentTask: { title: "Task A" },
    startedAt: Date.now(),
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

describe("CYD-133 UAT - Bulk Operations", () => {
  beforeEach(() => {
    mockUseAgentStatus.mockReset();
    mockUseAgentStatus.mockReturnValue({
      statusByAgent: new Map(),
      statuses: [],
      isLoading: false,
    });
    useActionMock.mockReset();
    useQueryMock.mockReset();
  });

  it("applies bulk pause to selected agents and shows results", async () => {
    const dispatchMock = vi.fn().mockResolvedValue({
      ok: true,
      operations: [
        { agentId: "agent_1", operationId: "op_1", status: "acked" },
        { agentId: "agent_2", operationId: "op_2", status: "acked" },
      ],
    });
    useActionMock.mockReturnValue(dispatchMock);

    render(<AgentStatusGrid agents={agents} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Beta" }));

    expect(screen.getByText("2 agents selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pause" }));

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          agentIds: ["agent_1", "agent_2"],
          command: "agent.pause",
          requestId: expect.any(String),
        })
      );
    });

    expect(await screen.findAllByText("Acked")).toHaveLength(2);
  });
});
