import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAction } from "convex/react";
import { BulkActionBar } from "@/components/agents/bulk-action-bar";
import type { AgentSummary } from "@/lib/agent-types";

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
}));

const useActionMock = vi.mocked(useAction);

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

describe("BulkActionBar", () => {
  beforeEach(() => {
    useActionMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when no agents are selected", () => {
    useActionMock.mockReturnValue(vi.fn());
    const { container } = render(
      <BulkActionBar selectedAgents={[]} onClearSelection={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("requires a priority before overriding", async () => {
    useActionMock.mockReturnValue(vi.fn());
    render(<BulkActionBar selectedAgents={agents} onClearSelection={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Override priority" }));

    expect(
      await screen.findByText("Select a priority to override.")
    ).toBeInTheDocument();
  });

  it("dispatches a priority override with params", async () => {
    const dispatchMock = vi.fn().mockResolvedValue({
      ok: true,
      operations: [{ agentId: "agent_1", operationId: "op1", status: "acked" }],
    });
    useActionMock.mockReturnValue(dispatchMock);

    render(
      <BulkActionBar selectedAgents={[agents[0]]} onClearSelection={vi.fn()} />
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "high" }));
    await user.click(screen.getByRole("button", { name: "Override priority" }));

    expect(dispatchMock).toHaveBeenCalledWith({
      agentIds: ["agent_1"],
      command: "agent.priority.override",
      params: { priority: "high" },
    });
  });

  it("retries only failed agents", async () => {
    const dispatchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        operations: [
          { agentId: "agent_1", operationId: "op1", status: "failed" },
          { agentId: "agent_2", operationId: "op2", status: "acked" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        operations: [
          { agentId: "agent_1", operationId: "op3", status: "acked" },
        ],
      });
    useActionMock.mockReturnValue(dispatchMock);

    render(<BulkActionBar selectedAgents={agents} onClearSelection={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Pause" }));

    const retryButton = await screen.findByRole("button", {
      name: "Retry failed (1)",
    });
    await user.click(retryButton);

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        agentIds: ["agent_1"],
        command: "agent.pause",
      });
    });
  });

  it("surfaces response errors from bulk dispatch", async () => {
    const dispatchMock = vi.fn().mockResolvedValue({
      ok: false,
      error: "bridge rejected",
      operations: [],
    });
    useActionMock.mockReturnValue(dispatchMock);

    render(<BulkActionBar selectedAgents={agents} onClearSelection={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Pause" }));

    expect(await screen.findByText("bridge rejected")).toBeInTheDocument();
  });

  it("requires confirmation before killing", async () => {
    const dispatchMock = vi.fn().mockResolvedValue({
      ok: true,
      operations: [],
    });
    useActionMock.mockReturnValue(dispatchMock);
    vi.stubGlobal("confirm", vi.fn(() => false));

    render(
      <BulkActionBar selectedAgents={[agents[0]]} onClearSelection={vi.fn()} />
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Kill" }));

    expect(dispatchMock).not.toHaveBeenCalled();
  });
});
