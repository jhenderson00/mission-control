import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as conversations from "./conversations";
import { createMockCtx } from "@/test/convex-test-utils";

describe("conversations functions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignores invalid agent events", async () => {
    const ctx = createMockCtx();
    const result = await conversations.processAgentEvent._handler(ctx, {
      eventId: "evt_invalid",
      eventType: "agent",
      agentId: "agent_1",
      sessionKey: "session_1",
      timestamp: new Date().toISOString(),
      sequence: 1,
      payload: { malformed: true },
    });

    expect(result).toBeNull();
    const messages = await ctx.db.query("messages").collect();
    expect(messages).toHaveLength(0);
  });

  it("stores streaming agent deltas", async () => {
    const ctx = createMockCtx();
    const result = await conversations.processAgentEvent._handler(ctx, {
      eventId: "evt_stream",
      eventType: "agent",
      agentId: "agent_1",
      sessionKey: undefined,
      timestamp: new Date().toISOString(),
      sequence: 5,
      payload: {
        runId: "run_1",
        sessionKey: "session_1",
        status: "streaming",
        delta: {
          type: "text",
          content: "Hello from the stream",
        },
      },
    });

    expect(result).toBeTypeOf("string");
    const messages = await ctx.db.query("messages").collect();
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("Hello from the stream");
    expect(messages[0].isStreaming).toBe(true);
  });

  it("stores chat messages and lists by session", async () => {
    const ctx = createMockCtx();
    const ids = await conversations.processChatEvent._handler(ctx, {
      eventId: "evt_chat",
      eventType: "chat",
      agentId: "agent_2",
      sessionKey: "session_2",
      timestamp: new Date().toISOString(),
      sequence: 10,
      payload: {
        messages: [
          { role: "user", content: "Ping" },
          { content: "Pong" },
        ],
      },
    });

    expect(ids).toHaveLength(2);

    const bySession = await conversations.listBySession._handler(ctx, {
      sessionKey: "session_2",
      limit: 1,
    });

    expect(bySession).toHaveLength(1);
    expect(bySession[0].role).toBe("user");
  });
});
