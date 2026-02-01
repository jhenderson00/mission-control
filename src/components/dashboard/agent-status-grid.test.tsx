import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useAction } from "convex/react";
import { AgentStatusGrid } from "@/components/dashboard/agent-status-grid";
import type { AgentSummary } from "@/lib/agent-types";

vi.mock("@/lib/realtime", () => ({
  useAgentStatus: () => ({
    statusByAgent: new Map(),
    statuses: [],
    isLoading: false,
  }),
}));

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
}));

const useActionMock = vi.mocked(useAction);

describe("AgentStatusGrid", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    useActionMock.mockReset();
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

  it("dispatches bulk pause for selected agents", async () => {
    const dispatchMock = vi.fn().mockResolvedValue({
      ok: true,
      operations: [
        { agentId: "agent_1", operationId: "op1", status: "acked" },
        { agentId: "agent_2", operationId: "op2", status: "acked" },
      ],
    });
    useActionMock.mockReturnValue(dispatchMock);

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

    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Select Beta" }));
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    });

    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentIds: ["agent_1", "agent_2"],
        command: "agent.pause",
        requestId: expect.any(String),
      })
    );
  });

  it("selects all agents from the header control", () => {
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

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));

    expect(screen.getByRole("checkbox", { name: "Select Alpha" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Beta" })).toBeChecked();
  });

  it("supports keyboard shortcuts for select all and clear", () => {
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

    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    expect(screen.getByRole("checkbox", { name: "Select Alpha" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Beta" })).toBeChecked();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("checkbox", { name: "Select Alpha" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Beta" })).not.toBeChecked();
  });
});
