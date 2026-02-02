import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useActivityFeed, useAgentStatus, useConversation } from "@/lib/realtime";
import { useConnectionStore } from "@/lib/realtime/connection-store";
import type { ConnectionState } from "convex/browser";
import { useConvexConnectionState, useQuery } from "convex/react";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useConvexConnectionState: vi.fn(),
}));

const useQueryMock = vi.mocked(useQuery);
const useConnectionStateMock = vi.mocked(useConvexConnectionState);

const connectedState: ConnectionState = {
  hasInflightRequests: false,
  isWebSocketConnected: true,
  timeOfOldestInflightRequest: null,
  hasEverConnected: true,
  connectionCount: 1,
  connectionRetries: 0,
  inflightMutations: 0,
  inflightActions: 0,
};

describe("realtime hooks", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useConnectionStateMock.mockReturnValue(connectedState);
    useConnectionStore.setState({
      status: "connecting",
      state: null,
      lastUpdated: 0,
      lastError: undefined,
      lastReconnectAt: 0,
      subscriptions: {},
    });
  });

  afterEach(() => {
    useQueryMock.mockReset();
  });

  it("useActivityFeed tracks loading and returns events", () => {
    useQueryMock.mockReturnValue(undefined);

    const { result, rerender } = renderHook(() =>
      useActivityFeed({ type: "chat", limit: 2 })
    );

    expect(result.current.isLoading).toBe(true);

    useQueryMock.mockReturnValue([
      {
        _id: "event_1",
        agentId: "agent_1",
        createdAt: 1000,
        type: "chat",
        content: "Hello",
      },
    ]);

    rerender();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.events).toHaveLength(1);
  });

  it("useAgentStatus builds a lookup map", () => {
    useQueryMock.mockReturnValue([
      {
        agentId: "agent_1",
        status: "online",
        lastHeartbeat: 100,
        lastActivity: 120,
      },
    ]);

    const { result } = renderHook(() =>
      useAgentStatus({ agentIds: ["agent_1"] })
    );

    expect(useQueryMock.mock.calls[0]?.[1]).toEqual({
      agentIds: ["agent_1"],
    });
    expect(result.current.statusByAgent.get("agent_1")?.status).toBe("online");
  });

  it("useAgentStatus omits empty agent id filters", () => {
    useQueryMock.mockReturnValueOnce([]);

    renderHook(() => useAgentStatus({ agentIds: [] }));
    expect(useQueryMock.mock.calls[0]?.[1]).toEqual({ agentIds: undefined });
  });

  it("useConversation skips when session key is missing", () => {
    useQueryMock.mockReturnValueOnce([]);

    const { result } = renderHook(() => useConversation(undefined));
    expect(useQueryMock.mock.calls[0]?.[1]).toBe("skip");
    expect(result.current.isLoading).toBe(false);
  });

  it("useConversation returns messages and streaming state", () => {
    useQueryMock.mockReturnValue([
      {
        sessionKey: "session_1",
        agentId: "agent_1",
        role: "assistant",
        content: "First",
        isStreaming: false,
        timestamp: 10,
        sequence: 1,
      },
      {
        sessionKey: "session_1",
        agentId: "agent_1",
        role: "assistant",
        content: "Second",
        isStreaming: true,
        timestamp: 20,
        sequence: 2,
      },
    ]);

    const { result } = renderHook(() => useConversation("session_1"));
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.latestMessage?.content).toBe("Second");
    expect(result.current.isStreaming).toBe(true);
  });
});
