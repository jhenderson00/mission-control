import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import {
  useActivityFeed,
  useAgentStatus,
  useConversation,
} from "@/lib/realtime";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useConvexConnectionState: () => ({
    isWebSocketConnected: true,
    hasEverConnected: true,
  }),
}));

const useQueryMock = vi.mocked(useQuery);

function ActivityProbe() {
  const { events, isLoading } = useActivityFeed({ limit: 2 });
  return (
    <div data-testid="activity" data-loading={String(isLoading)}>
      {events.length}
    </div>
  );
}

function AgentStatusProbe() {
  const { statuses } = useAgentStatus();
  return <div data-testid="status">{statuses.length}</div>;
}

function ConversationProbe({ sessionKey }: { sessionKey: string }) {
  const { messages } = useConversation(sessionKey, { limit: 2 });
  return <div data-testid="conversation">{messages.length}</div>;
}

describe("realtime hooks", () => {
  afterEach(() => {
    useQueryMock.mockReset();
  });

  it("returns activity feed results", () => {
    useQueryMock.mockImplementation((query) => {
      if (query === "events.listRecent") {
        return [
          {
            _id: "event_1",
            agentId: "agent_alpha",
            createdAt: 10,
            type: "chat",
            content: "Hello",
          },
        ];
      }
      return undefined;
    });

    render(<ActivityProbe />);
    const node = screen.getByTestId("activity");
    expect(node.textContent).toBe("1");
    expect(node.getAttribute("data-loading")).toBe("false");
  });

  it("returns agent status results", () => {
    useQueryMock.mockReturnValue([
      {
        agentId: "agent_alpha",
        status: "online",
        lastHeartbeat: 20,
        lastActivity: 25,
      },
    ]);

    render(<AgentStatusProbe />);
    expect(screen.getByTestId("status").textContent).toBe("1");
  });

  it("returns conversation messages", () => {
    useQueryMock.mockReturnValue([
      {
        sessionKey: "session_1",
        agentId: "agent_alpha",
        role: "assistant",
        content: "Ack",
        isStreaming: false,
        timestamp: 50,
        sequence: 1,
      },
    ]);

    render(<ConversationProbe sessionKey="session_1" />);
    expect(screen.getByTestId("conversation").textContent).toBe("1");
  });
});
