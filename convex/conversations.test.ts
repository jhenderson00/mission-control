import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as conversations from "./conversations";
import { createMockCtx, asHandler } from "@/test/convex-test-utils";

describe("conversations functions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("processAgentEvent inserts and updates streaming messages", async () => {
    const ctx = createMockCtx();
    const baseEvent = {
      eventId: "evt_1",
      eventType: "agent",
      agentId: "agent_1",
      sessionKey: "session_1",
      timestamp: new Date().toISOString(),
      sequence: 1,
      payload: {
        runId: "run_1",
        sessionKey: "session_1",
        status: "streaming",
        delta: {
          type: "text",
          content: "Hello",
        },
      },
    };

    const firstId = await asHandler(conversations.processAgentEvent)._handler(ctx, baseEvent);
    const inserted = await ctx.db.query("messages").collect();

    expect(firstId).toBeTruthy();
    expect(inserted).toHaveLength(1);
    expect(inserted[0].content).toBe("Hello");
    expect(inserted[0].isStreaming).toBe(true);

    const updatedId = await asHandler(conversations.processAgentEvent)._handler(ctx, {
      ...baseEvent,
      payload: {
        ...baseEvent.payload,
        status: "done",
        delta: { type: "text", content: "Updated" },
      },
    });

    const updated = await ctx.db.query("messages").collect();
    expect(updatedId).toBe(firstId);
    expect(updated).toHaveLength(1);
    expect(updated[0].content).toBe("Updated");
    expect(updated[0].isStreaming).toBe(false);

    await asHandler(conversations.processAgentEvent)._handler(ctx, {
      ...baseEvent,
      sequence: 2,
      payload: {
        ...baseEvent.payload,
        delta: { type: "tool_call", toolName: "search", toolInput: { q: "help" } },
      },
    });

    const toolMessage = (await ctx.db.query("messages").collect()).find(
      (message) => message.sequence === 2
    );
    expect(toolMessage?.content).toContain("tool_call");
  });

  it("processAgentEvent ignores invalid payloads", async () => {
    const ctx = createMockCtx();
    const invalidPayload = await asHandler(conversations.processAgentEvent)._handler(ctx, {
      eventId: "evt_invalid",
      eventType: "agent",
      agentId: "agent_1",
      sessionKey: "session_1",
      timestamp: new Date().toISOString(),
      sequence: 1,
      payload: { nope: true },
    });

    const missingDelta = await asHandler(conversations.processAgentEvent)._handler(ctx, {
      eventId: "evt_missing",
      eventType: "agent",
      agentId: "agent_1",
      sessionKey: "session_1",
      timestamp: new Date().toISOString(),
      sequence: 2,
      payload: { runId: "run_2", sessionKey: "session_1", status: "started" },
    });

    expect(invalidPayload).toBeNull();
    expect(missingDelta).toBeNull();
    expect(await ctx.db.query("messages").collect()).toHaveLength(0);
  });

  it("processChatEvent normalizes messages and sequences", async () => {
    const ctx = createMockCtx();
    const ids = await asHandler(conversations.processChatEvent)._handler(ctx, {
      eventId: "evt_chat",
      eventType: "chat",
      agentId: "agent_1",
      sessionKey: undefined,
      timestamp: "2026-01-01T00:00:00Z",
      sequence: 10,
      payload: {
        messages: [
          { sessionKey: "session_1", content: "Hi", role: "user" },
          {
            sessionKey: "session_1",
            content: "Unknown role",
            timestamp: "not-a-date",
          },
          { content: "Skipped", role: "system" },
        ],
      },
    });

    const stored = await ctx.db.query("messages").collect();
    const unknown = stored.find((message) => message.content === "Unknown role");

    expect(ids).toHaveLength(2);
    expect(stored).toHaveLength(2);
    expect(unknown?.role).toBe("assistant");
    expect(stored[0].sequence).toBe(10);
    expect(stored[1].sequence).toBe(11);
  });

  it("processChatEvent handles array payloads", async () => {
    const ctx = createMockCtx();
    const ids = await asHandler(conversations.processChatEvent)._handler(ctx, {
      eventId: "evt_array",
      eventType: "chat",
      agentId: "agent_2",
      sessionKey: "session_2",
      timestamp: "2026-01-01T00:00:00Z",
      sequence: 3,
      payload: [{ content: "From array", role: "system" }],
    });

    expect(ids).toHaveLength(1);
    const stored = await ctx.db.query("messages").collect();
    expect(stored[0].content).toBe("From array");
  });

  it("lists messages by session with ordering and limit", async () => {
    const ctx = createMockCtx();
    await ctx.db.insert("messages", {
      sessionKey: "session_1",
      agentId: "agent_1",
      role: "assistant",
      content: "First",
      isStreaming: false,
      timestamp: Date.now(),
      sequence: 1,
    });

    vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
    await ctx.db.insert("messages", {
      sessionKey: "session_1",
      agentId: "agent_1",
      role: "assistant",
      content: "Second",
      isStreaming: false,
      timestamp: Date.now(),
      sequence: 2,
    });

    await ctx.db.insert("messages", {
      sessionKey: "session_2",
      agentId: "agent_2",
      role: "assistant",
      content: "Other",
      isStreaming: false,
      timestamp: Date.now(),
      sequence: 3,
    });

    const results = await asHandler(conversations.listBySession)._handler(ctx, {
      sessionKey: "session_1",
      limit: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("First");
  });
});
