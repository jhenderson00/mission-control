import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAction } from "convex/react";
import { ControlPanel } from "@/components/agents/control-panel";
import { ConversationView } from "@/components/conversation/conversation-view";
import { PendingOperations } from "@/components/agents/pending-operations";
import { useOptimisticOperationsStore } from "@/lib/controls/optimistic-operations";
import type { OperationEntry } from "@/lib/controls/optimistic-operations";
import type { ConversationMessage } from "@/lib/realtime";

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
}));

const useActionMock = vi.mocked(useAction);

const resetOptimisticStore = () => {
  useOptimisticOperationsStore.setState({ operations: {} });
};

describe("CYD-133 UAT - Control Actions", () => {
  beforeEach(() => {
    useActionMock.mockReset();
    resetOptimisticStore();
  });

  it("pauses an agent and updates the operation status", async () => {
    const dispatchMock = vi.fn().mockResolvedValue({ ok: true, status: "acked" });
    useActionMock.mockReturnValue(dispatchMock);

    render(<ControlPanel agentId="agent_1" agentName="Alpha" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Pause" }));

    expect(await screen.findByText("Acknowledged (acked).")).toBeInTheDocument();
    await waitFor(() => {
      const operations = Object.values(
        useOptimisticOperationsStore.getState().operations
      );
      expect(operations).toHaveLength(1);
      expect(operations[0]?.command).toBe("agent.pause");
      expect(operations[0]?.status).toBe("acked");
    });
  });

  it("resumes an agent and records an acked status", async () => {
    const dispatchMock = vi.fn().mockResolvedValue({ ok: true, status: "acked" });
    useActionMock.mockReturnValue(dispatchMock);

    render(<ControlPanel agentId="agent_2" agentName="Beta" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Resume" }));

    expect(await screen.findByText("Acknowledged (acked).")).toBeInTheDocument();
    await waitFor(() => {
      const operations = Object.values(
        useOptimisticOperationsStore.getState().operations
      );
      expect(operations[0]?.command).toBe("agent.resume");
      expect(operations[0]?.status).toBe("acked");
    });
  });

  it("redirects an agent with the selected task reference", async () => {
    const dispatchMock = vi.fn().mockResolvedValue({ ok: true, status: "acked" });
    useActionMock.mockReturnValue(dispatchMock);

    render(<ControlPanel agentId="agent_3" agentName="Gamma" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Redirect" }));

    await user.type(
      screen.getByPlaceholderText("Task ID or search"),
      "task_42"
    );

    await user.click(screen.getByRole("button", { name: "Confirm redirect" }));

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: "agent_3",
          command: "agent.redirect",
          params: expect.objectContaining({ taskId: "task_42" }),
        })
      );
    });
  });

  it("kills an agent after confirmation", async () => {
    const dispatchMock = vi.fn().mockResolvedValue({ ok: true, status: "acked" });
    useActionMock.mockReturnValue(dispatchMock);

    render(<ControlPanel agentId="agent_4" agentName="Delta" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Kill" }));
    await user.type(
      screen.getByPlaceholderText("Type KILL Delta or CONFIRM"),
      "KILL Delta"
    );
    await user.click(screen.getByRole("button", { name: "Confirm kill" }));

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(
        expect.objectContaining({ command: "agent.kill" })
      );
    });
  });

  it("restarts an agent after confirmation", async () => {
    const dispatchMock = vi.fn().mockResolvedValue({ ok: true, status: "acked" });
    useActionMock.mockReturnValue(dispatchMock);

    render(<ControlPanel agentId="agent_4" agentName="Delta" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Restart" }));
    await user.type(
      screen.getByPlaceholderText("Type RESTART Delta or CONFIRM"),
      "RESTART Delta"
    );
    await user.click(screen.getByRole("button", { name: "Confirm restart" }));

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(
        expect.objectContaining({ command: "agent.restart" })
      );
    });
  });

  it("overrides priority and records the requested change", async () => {
    const dispatchMock = vi.fn().mockResolvedValue({ ok: true, status: "acked" });
    useActionMock.mockReturnValue(dispatchMock);

    render(<ControlPanel agentId="agent_5" agentName="Echo" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "high" }));
    await user.click(screen.getByRole("button", { name: "Override priority" }));

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          command: "agent.priority.override",
          params: { priority: "high" },
        })
      );
    });
  });

  it("surfaces failed operations with error details", async () => {
    const dispatchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: "failed",
      error: "Bridge rejected",
    });
    useActionMock.mockReturnValue(dispatchMock);

    render(<ControlPanel agentId="agent_6" agentName="Foxtrot" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Pause" }));

    expect(await screen.findByText("Bridge rejected")).toBeInTheDocument();
    await waitFor(() => {
      const operations = Object.values(
        useOptimisticOperationsStore.getState().operations
      );
      expect(operations[0]?.status).toBe("failed");
      expect(operations[0]?.error).toBe("Bridge rejected");
    });
  });

  it("marks a conversation session as terminated when cleared", () => {
    const messages: ConversationMessage[] = [
      {
        sessionKey: "alpha123",
        agentId: "agent_7",
        role: "assistant",
        content: "Still running",
        isStreaming: false,
        timestamp: 10,
        sequence: 1,
      },
    ];

    const { rerender } = render(
      <ConversationView messages={messages} isStreaming={false} sessionKey="alpha123" />
    );

    rerender(
      <ConversationView messages={[]} isStreaming={false} sessionKey={undefined} />
    );

    expect(
      screen.getByText("No active session detected for this agent yet.")
    ).toBeInTheDocument();
  });

  it("shows a new session label after restart", () => {
    const { rerender } = render(
      <ConversationView messages={[]} isStreaming={false} sessionKey="alpha123" />
    );

    expect(screen.getByText("Session alpha123")).toBeInTheDocument();

    rerender(
      <ConversationView messages={[]} isStreaming={false} sessionKey="bravo567" />
    );

    expect(screen.getByText("Session bravo567")).toBeInTheDocument();
  });

  it("renders failed operations in the pending list", () => {
    const operations: OperationEntry[] = [
      {
        operationId: "op_failed",
        agentId: "agent_8",
        command: "agent.pause",
        status: "failed",
        requestedAt: 100,
        requestedBy: "operator",
        error: "Network timeout",
        isOptimistic: true,
      },
    ];

    render(<PendingOperations operations={operations} isLoading={false} />);

    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Network timeout")).toBeInTheDocument();
  });
});
