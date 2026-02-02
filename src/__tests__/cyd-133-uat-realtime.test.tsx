import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { ConversationView } from "@/components/conversation/conversation-view";
import { AuditLog } from "@/components/agents/audit-log";
import type { ActivityEvent, ConversationMessage } from "@/lib/realtime";
import type { Doc } from "@/convex/_generated/dataModel";

const mockUseActivityFeed = vi.fn();

vi.mock("@/lib/realtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/realtime")>(
    "@/lib/realtime"
  );
  return {
    ...actual,
    useActivityFeed: (options?: { limit?: number; type?: string }) =>
      mockUseActivityFeed(options),
  };
});

describe("CYD-133 UAT - Realtime Features", () => {
  beforeEach(() => {
    mockUseActivityFeed.mockReset();
  });

  it("streams new activity events into the feed", () => {
    const event1: ActivityEvent = {
      _id: "event_1",
      agentId: "agent_1",
      createdAt: 1761931200000,
      type: "chat",
      content: "Initial event",
    };
    const event2: ActivityEvent = {
      _id: "event_2",
      agentId: "agent_2",
      createdAt: 1761931210000,
      type: "heartbeat",
      content: "Second event",
    };

    mockUseActivityFeed.mockReturnValue({ events: [event1], isLoading: false });

    const { rerender } = render(<ActivityFeed />);
    expect(screen.getByText("Initial event")).toBeInTheDocument();

    mockUseActivityFeed.mockReturnValue({
      events: [event1, event2],
      isLoading: false,
    });

    rerender(<ActivityFeed />);

    expect(screen.getByText("Second event")).toBeInTheDocument();
  });

  it("shows a streaming indicator for live conversations", () => {
    const messages: ConversationMessage[] = [
      {
        sessionKey: "stream123",
        agentId: "agent_3",
        role: "assistant",
        content: "Streaming message",
        isStreaming: true,
        timestamp: 100,
        sequence: 1,
      },
    ];

    render(
      <ConversationView
        messages={messages}
        isStreaming={true}
        sessionKey="stream123"
      />
    );

    expect(screen.getByText("Streaming")).toBeInTheDocument();
  });

  it("renders audit log entries when actions are recorded", () => {
    const audits: Array<Doc<"auditLog">> = [
      {
        _id: "audit_1" as Doc<"auditLog">["_id"],
        _creationTime: 1,
        action: "pause",
        operationId: "op_1",
        requestId: "req_1",
        agentId: "agent_1",
        command: "agent.pause",
        outcome: "accepted",
        requestedBy: "operator_1",
        requestedAt: 100,
      },
    ];

    const { rerender } = render(<AuditLog audits={audits} isLoading={false} />);

    expect(screen.getByText("agent.pause")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();

    const nextAudits: Array<Doc<"auditLog">> = [
      ...audits,
      {
        _id: "audit_2" as Doc<"auditLog">["_id"],
        _creationTime: 2,
        action: "resume",
        operationId: "op_2",
        requestId: "req_2",
        agentId: "agent_1",
        command: "agent.resume",
        outcome: "accepted",
        requestedBy: "operator_1",
        requestedAt: 200,
      },
    ];

    rerender(<AuditLog audits={nextAudits} isLoading={false} />);

    expect(screen.getByText("agent.resume")).toBeInTheDocument();
  });
});
