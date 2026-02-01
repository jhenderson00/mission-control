import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAction } from "convex/react";
import { ControlPanel } from "@/components/agents/control-panel";

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
}));

const useActionMock = vi.mocked(useAction);

describe("ControlPanel", () => {
  beforeEach(() => {
    useActionMock.mockReset();
  });

  it("dispatches pause with a reason", async () => {
    const dispatchMock = vi.fn().mockResolvedValue({ ok: true, status: "acked" });
    useActionMock.mockReturnValue(dispatchMock);

    render(<ControlPanel agentId="agent_1" agentName="Alpha" />);
    const user = userEvent.setup();

    await user.type(
      screen.getByPlaceholderText("Optional pause reason"),
      "Need a break"
    );
    await user.click(screen.getByRole("button", { name: "Pause" }));

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        agentId: "agent_1",
        command: "agent.pause",
        params: { reason: "Need a break" },
      });
    });

    expect(await screen.findByText("Acknowledged (acked)."))
      .toBeInTheDocument();
  });

  it("surfaces errors when dispatch rejects", async () => {
    const dispatchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: "failed", error: "nope" });
    useActionMock.mockReturnValue(dispatchMock);

    render(<ControlPanel agentId="agent_1" agentName="Alpha" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Resume" }));

    expect(await screen.findByText("nope")).toBeInTheDocument();
  });

  it("requires a task id for redirect", async () => {
    const dispatchMock = vi.fn();
    useActionMock.mockReturnValue(dispatchMock);

    render(<ControlPanel agentId="agent_1" agentName="Alpha" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Redirect" }));

    expect(
      await screen.findByText("Redirect requires a task ID.")
    ).toBeInTheDocument();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("requires a priority override selection", async () => {
    const dispatchMock = vi.fn();
    useActionMock.mockReturnValue(dispatchMock);

    render(<ControlPanel agentId="agent_1" agentName="Alpha" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Override priority" }));

    expect(
      await screen.findByText("Select a priority to override.")
    ).toBeInTheDocument();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("blocks controls when disabled", async () => {
    const dispatchMock = vi.fn();
    useActionMock.mockReturnValue(dispatchMock);

    render(<ControlPanel agentId="agent_1" agentName="Alpha" disabled />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Pause" }));

    expect(
      await screen.findByText(
        "Controls are unavailable without a Convex connection."
      )
    ).toBeInTheDocument();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("requires confirmation before killing the agent", async () => {
    const dispatchMock = vi.fn().mockResolvedValue({ ok: true, status: "acked" });
    useActionMock.mockReturnValue(dispatchMock);

    render(<ControlPanel agentId="agent_1" agentName="Alpha" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Kill" }));

    const confirmButton = screen.getByRole("button", { name: "Confirm kill" });
    expect(confirmButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("Type Alpha or CONFIRM"),
      "Alpha"
    );

    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(
        expect.objectContaining({ command: "agent.kill" })
      );
    });
  });

  it("requires confirmation before restarting the agent", async () => {
    const dispatchMock = vi.fn().mockResolvedValue({ ok: true, status: "acked" });
    useActionMock.mockReturnValue(dispatchMock);

    render(<ControlPanel agentId="agent_1" agentName="Alpha" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Restart" }));

    const confirmButton = screen.getByRole("button", { name: "Confirm restart" });
    expect(confirmButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("Type Alpha or CONFIRM"),
      "CONFIRM"
    );

    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(
        expect.objectContaining({ command: "agent.restart" })
      );
    });
  });
});
