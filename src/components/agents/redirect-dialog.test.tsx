import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RedirectDialog } from "@/components/agents/redirect-dialog";

describe("RedirectDialog", () => {
  const defaultProps = {
    agentId: "agent_1",
    agentName: "Alpha",
    agentStatus: "active",
    currentTaskTitle: "Current Task",
    onConfirm: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the redirect button", () => {
    render(<RedirectDialog {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Redirect" })).toBeInTheDocument();
  });

  it("opens dialog when trigger is clicked", async () => {
    render(<RedirectDialog {...defaultProps} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Redirect" }));

    expect(screen.getByText("Redirect agent")).toBeInTheDocument();
  });

  it("shows current agent status in the dialog", async () => {
    render(<RedirectDialog {...defaultProps} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Redirect" }));

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText(/Current task:/)).toBeInTheDocument();
  });

  it("requires a task reference before confirming in reference mode", async () => {
    render(<RedirectDialog {...defaultProps} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Redirect" }));

    const confirmButton = screen.getByRole("button", { name: "Confirm redirect" });
    expect(confirmButton).toBeDisabled();
  });

  it("enables confirm button when task reference is provided", async () => {
    render(<RedirectDialog {...defaultProps} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Redirect" }));
    await user.type(screen.getByPlaceholderText("Task ID or search"), "task_123");

    const confirmButton = screen.getByRole("button", { name: "Confirm redirect" });
    expect(confirmButton).toBeEnabled();
  });

  it("calls onConfirm with task reference payload", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<RedirectDialog {...defaultProps} onConfirm={onConfirm} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Redirect" }));
    await user.type(screen.getByPlaceholderText("Task ID or search"), "task_123");
    await user.click(screen.getByRole("button", { name: "Confirm redirect" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        taskId: "task_123",
        taskPayload: undefined,
        priority: undefined,
      });
    });
  });

  it("switches to payload mode when Payload JSON button is clicked", async () => {
    render(<RedirectDialog {...defaultProps} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Redirect" }));
    await user.click(screen.getByRole("button", { name: "Payload JSON" }));

    expect(
      screen.getByPlaceholderText(/{"title":/)
    ).toBeInTheDocument();
  });

  it("validates JSON payload and shows error for invalid JSON", async () => {
    render(<RedirectDialog {...defaultProps} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Redirect" }));
    await user.click(screen.getByRole("button", { name: "Payload JSON" }));
    await user.type(screen.getByRole("textbox"), "invalid json");

    // The FormMessage component displays JSON parsing errors
    expect(await screen.findByText(/Unexpected token/i)).toBeInTheDocument();
  });

  it("enables confirm button when valid JSON payload is provided", async () => {
    render(<RedirectDialog {...defaultProps} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Redirect" }));
    await user.click(screen.getByRole("button", { name: "Payload JSON" }));
    
    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, '{{"title": "New task"}');

    const confirmButton = screen.getByRole("button", { name: "Confirm redirect" });
    expect(confirmButton).toBeEnabled();
  });

  it("calls onConfirm with JSON payload", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<RedirectDialog {...defaultProps} onConfirm={onConfirm} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Redirect" }));
    await user.click(screen.getByRole("button", { name: "Payload JSON" }));
    
    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, '{{"title": "New task"}');
    await user.click(screen.getByRole("button", { name: "Confirm redirect" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        taskId: undefined,
        taskPayload: { title: "New task" },
        priority: undefined,
      });
    });
  });

  it("includes priority when selected", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<RedirectDialog {...defaultProps} onConfirm={onConfirm} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Redirect" }));
    await user.type(screen.getByPlaceholderText("Task ID or search"), "task_123");
    await user.click(screen.getByRole("button", { name: "high" }));
    await user.click(screen.getByRole("button", { name: "Confirm redirect" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        taskId: "task_123",
        taskPayload: undefined,
        priority: "high",
      });
    });
  });

  it("clears priority when Clear button is clicked", async () => {
    render(<RedirectDialog {...defaultProps} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Redirect" }));
    await user.click(screen.getByRole("button", { name: "high" }));

    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("shows preview when task reference is provided", async () => {
    render(<RedirectDialog {...defaultProps} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Redirect" }));
    await user.type(screen.getByPlaceholderText("Task ID or search"), "task_abc");

    expect(await screen.findByText("task_abc")).toBeInTheDocument();
  });

  it("resets form when dialog is closed", async () => {
    render(<RedirectDialog {...defaultProps} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Redirect" }));
    await user.type(screen.getByPlaceholderText("Task ID or search"), "task_123");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Redirect" }));

    const input = screen.getByPlaceholderText("Task ID or search");
    expect(input).toHaveValue("");
  });

  it("disables controls when disabled prop is true", () => {
    render(<RedirectDialog {...defaultProps} disabled />);
    expect(screen.getByRole("button", { name: "Redirect" })).toBeDisabled();
  });

  it("shows pending state when pending prop is true", () => {
    render(<RedirectDialog {...defaultProps} pending />);
    expect(screen.getByRole("button", { name: "Redirecting..." })).toBeInTheDocument();
  });
});
