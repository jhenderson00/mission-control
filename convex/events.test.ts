import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as events from "./events";
import { internal } from "./_generated/api";
import { createMockCtx, asHandler, asHttpAction } from "@/test/convex-test-utils";

describe("events functions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists events by agent", async () => {
    const ctx = createMockCtx();
    const agentId = "agent_1";
    await ctx.db.insert("events", {
      eventId: "evt_1",
      eventType: "agent",
      agentId,
      sessionKey: "session_1",
      timestamp: new Date().toISOString(),
      sequence: 1,
      payload: { delta: { content: "Hello" } },
      receivedAt: Date.now(),
    });

    const byAgent = await asHandler(events.listByAgent)._handler(ctx, { agentId });

    expect(byAgent).toHaveLength(1);
    expect(byAgent[0].content).toContain("Hello");
  });

  it("maps convex agent ids to bridge agent ids when listing by agent", async () => {
    const ctx = createMockCtx();
    const agentRecordId = await ctx.db.insert("agents", {
      name: "Bridge",
      status: "idle",
      type: "executor",
      model: "m1",
      host: "local",
      bridgeAgentId: "agent_bridge",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("events", {
      eventId: "evt_bridge",
      eventType: "agent",
      agentId: "agent_bridge",
      sessionKey: "session_bridge",
      timestamp: new Date().toISOString(),
      sequence: 1,
      payload: { delta: { content: "Mapped" } },
      receivedAt: Date.now(),
    });

    const byAgent = await asHandler(events.listByAgent)._handler(ctx, {
      agentId: agentRecordId as never,
    });

    expect(byAgent).toHaveLength(1);
    expect(byAgent[0].content).toContain("Mapped");
  });

  it("lists recent events with optional type filter", async () => {
    const ctx = createMockCtx();
    await ctx.db.insert("events", {
      eventId: "evt_1",
      eventType: "heartbeat",
      agentId: "agent_1",
      sessionKey: "session_1",
      timestamp: new Date().toISOString(),
      sequence: 1,
      payload: { status: "ok" },
      receivedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      eventId: "evt_2",
      eventType: "agent",
      agentId: "agent_2",
      sessionKey: "session_2",
      timestamp: new Date().toISOString(),
      sequence: 2,
      payload: { delta: { content: "Hi" } },
      receivedAt: Date.now(),
    });

    const all = await asHandler(events.listRecent)._handler(ctx, { limit: 10 });
    const filtered = await asHandler(events.listRecent)._handler(ctx, { type: "heartbeat" });

    expect(all).toHaveLength(2);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].type).toBe("heartbeat");
  });

  it("lists diagnostic events with derived metadata", async () => {
    const ctx = createMockCtx();
    await ctx.db.insert("events", {
      eventId: "evt_chat",
      eventType: "chat",
      agentId: "agent_1",
      sessionKey: "session_1",
      timestamp: new Date().toISOString(),
      sequence: 1,
      payload: { content: "ignore" },
      receivedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      eventId: "evt_tool_result",
      eventType: "tool_result",
      agentId: "agent_2",
      sessionKey: "session_2",
      timestamp: new Date().toISOString(),
      sequence: 2,
      payload: { toolName: "search", durationMs: 120, status: "ok" },
      receivedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      eventId: "evt_error",
      eventType: "error",
      agentId: "agent_3",
      sessionKey: "session_3",
      timestamp: new Date().toISOString(),
      sequence: 3,
      payload: { message: "Boom" },
      receivedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      eventId: "evt_diag",
      eventType: "diagnostic.warning",
      agentId: "agent_4",
      sessionKey: "session_4",
      timestamp: new Date().toISOString(),
      sequence: 4,
      payload: { level: "warning", message: "Latency high" },
      receivedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      eventId: "evt_health",
      eventType: "health",
      agentId: "system",
      sessionKey: "system",
      timestamp: new Date().toISOString(),
      sequence: 5,
      payload: { ok: false },
      receivedAt: Date.now(),
    });

    const diagnostics = await asHandler(events.listDiagnostics)._handler(ctx, { limit: 10 });

    expect(diagnostics.some((event: { eventType: string }) => event.eventType === "chat")).toBe(false);

    const tool = diagnostics.find((event: { eventType: string }) => event.eventType === "tool_result");
    expect(tool?.toolName).toBe("search");
    expect(tool?.durationMs).toBe(120);
    expect(tool?.success).toBe(true);

    const diag = diagnostics.find((event: { eventType: string }) => event.eventType === "diagnostic.warning");
    expect(diag?.level).toBe("warning");

    const health = diagnostics.find((event: { eventType: string }) => event.eventType === "health");
    expect(health?.level).toBe("error");
  });

  it("counts events by type with since filter", async () => {
    const ctx = createMockCtx();
    await ctx.db.insert("events", {
      eventId: "evt_1",
      eventType: "agent",
      agentId: "agent_1",
      sessionKey: "session_1",
      timestamp: new Date().toISOString(),
      sequence: 1,
      payload: { delta: { content: "One" } },
      receivedAt: Date.now() - 1000,
    });
    await ctx.db.insert("events", {
      eventId: "evt_2",
      eventType: "agent",
      agentId: "agent_1",
      sessionKey: "session_1",
      timestamp: new Date().toISOString(),
      sequence: 2,
      payload: { delta: { content: "Two" } },
      receivedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      eventId: "evt_3",
      eventType: "error",
      agentId: "agent_2",
      sessionKey: "session_2",
      timestamp: new Date().toISOString(),
      sequence: 3,
      payload: { message: "Failure" },
      receivedAt: Date.now(),
    });

    const counts = await asHandler(events.countsByType)._handler(ctx, { since: Date.now() - 500 });
    expect(counts.agent).toBe(1);
    expect(counts.error).toBe(1);
  });

  it("summarizes payload shapes into content", async () => {
    const ctx = createMockCtx();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await ctx.db.insert("events", {
      eventId: "evt_str",
      eventType: "chat",
      agentId: "agent_1",
      sessionKey: "session_1",
      timestamp: new Date().toISOString(),
      sequence: 1,
      payload: "Raw string payload",
      receivedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      eventId: "evt_content",
      eventType: "agent",
      agentId: "agent_2",
      sessionKey: "session_2",
      timestamp: new Date().toISOString(),
      sequence: 2,
      payload: { content: "Object content" },
      receivedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      eventId: "evt_delta",
      eventType: "agent",
      agentId: "agent_3",
      sessionKey: "session_3",
      timestamp: new Date().toISOString(),
      sequence: 3,
      payload: { delta: { content: "Delta content" } },
      receivedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      eventId: "evt_status",
      eventType: "heartbeat",
      agentId: "agent_4",
      sessionKey: "session_4",
      timestamp: "invalid",
      sequence: 4,
      payload: { status: "ok" },
      receivedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      eventId: "evt_circular",
      eventType: "agent",
      agentId: "agent_5",
      sessionKey: "session_5",
      timestamp: new Date().toISOString(),
      sequence: 5,
      payload: circular,
      receivedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      eventId: "evt_tool",
      eventType: "tool_call",
      agentId: "agent_6",
      sessionKey: "session_6",
      timestamp: new Date().toISOString(),
      sequence: 6,
      payload: { toolName: "search", toolInput: { q: "help" } },
      receivedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      eventId: "evt_usage",
      eventType: "token_usage",
      agentId: "agent_7",
      sessionKey: "session_7",
      timestamp: new Date().toISOString(),
      sequence: 7,
      payload: { inputTokens: 120, outputTokens: 80, durationMs: 1530 },
      receivedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      eventId: "evt_diag",
      eventType: "diagnostic.warning",
      agentId: "agent_8",
      sessionKey: "session_8",
      timestamp: new Date().toISOString(),
      sequence: 8,
      payload: { level: "warning", message: "Latency high" },
      receivedAt: Date.now(),
    });

    const recent = await asHandler(events.listRecent)._handler(ctx, { limit: 10 });
    const contents = recent.map((event: { content: string }) => event.content);

    expect(contents).toEqual(
      expect.arrayContaining([
        "Raw string payload",
        "Object content",
        "Delta content",
        "ok",
        "agent",
        "warning: Latency high",
      ])
    );
    expect(contents.some((content: string) => content.startsWith("Tool call"))).toBe(true);
    expect(contents.some((content: string) => content.includes("tokens"))).toBe(true);
  });

  it("stores events idempotently", async () => {
    const ctx = createMockCtx();
    const id1 = await asHandler(events.store)._handler(ctx, {
      eventId: "evt_idempotent",
      eventType: "agent",
      agentId: "agent_1",
      sessionKey: "session_1",
      timestamp: new Date().toISOString(),
      sequence: 1,
      payload: { delta: { content: "One" } },
    });
    const id2 = await asHandler(events.store)._handler(ctx, {
      eventId: "evt_idempotent",
      eventType: "agent",
      agentId: "agent_1",
      sessionKey: "session_1",
      timestamp: new Date().toISOString(),
      sequence: 1,
      payload: { delta: { content: "One" } },
    });

    expect(id1).toBe(id2);
  });

  it("ingests events and routes by type", async () => {
    const ctx = { runMutation: vi.fn(async () => {}) };
    const payload = [
      {
        eventId: "evt_agent",
        eventType: "agent",
        agentId: "agent_1",
        sessionKey: "session_1",
        timestamp: new Date().toISOString(),
        sequence: 1,
        payload: { delta: { content: "hello" } },
      },
      {
        eventId: "evt_chat",
        eventType: "chat",
        agentId: "agent_2",
        sessionKey: "session_2",
        timestamp: new Date().toISOString(),
        sequence: 2,
        payload: { content: "chat" },
      },
      {
        eventId: "evt_presence",
        eventType: "presence",
        agentId: "agent_3",
        sessionKey: "session_3",
        timestamp: new Date().toISOString(),
        sequence: 3,
        payload: { status: "ok" },
      },
      {
        eventId: "evt_other",
        eventType: "unknown",
        agentId: "agent_4",
        sessionKey: "session_4",
        timestamp: new Date().toISOString(),
        sequence: 4,
        payload: { status: "noop" },
      },
    ];

    const response = await asHttpAction(events.ingest)(
      ctx as never,
      new Request("https://example.test/ingest", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalled();
  });

  it("routes presence and heartbeat events to status updates", async () => {
    const ctx = { runMutation: vi.fn(async () => {}) };
    const payload = [
      {
        eventId: "evt_presence",
        eventType: "presence",
        agentId: "agent_presence",
        sessionKey: "session_presence",
        timestamp: new Date().toISOString(),
        sequence: 1,
        payload: { entries: [] },
      },
      {
        eventId: "evt_heartbeat",
        eventType: "heartbeat",
        agentId: "agent_heartbeat",
        sessionKey: "session_heartbeat",
        timestamp: new Date().toISOString(),
        sequence: 2,
        payload: { status: "ok" },
      },
    ];

    const response = await asHttpAction(events.ingest)(
      ctx as never,
      new Request("https://example.test/ingest", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      internal.agents.updateStatusFromEvent,
      expect.objectContaining({ eventId: "evt_presence" })
    );
    expect(ctx.runMutation).toHaveBeenCalledWith(
      internal.agents.updateStatusFromEvent,
      expect.objectContaining({ eventId: "evt_heartbeat" })
    );
  });

  it("rejects unauthorized or invalid ingest payloads", async () => {
    const originalSecret = process.env.BRIDGE_SECRET;
    process.env.BRIDGE_SECRET = "secret";
    const unauthorized = await asHttpAction(events.ingest)(
      { runMutation: vi.fn() } as never,
      new Request("https://example.test/ingest", { method: "POST", body: "{}" })
    );
    expect(unauthorized.status).toBe(401);

    process.env.BRIDGE_SECRET = "";
    const invalid = await asHttpAction(events.ingest)(
      { runMutation: vi.fn() } as never,
      new Request("https://example.test/ingest", { method: "POST", body: "{}" })
    );
    expect(invalid.status).toBe(400);

    process.env.BRIDGE_SECRET = originalSecret;
  });

  it("rejects invalid json bodies", async () => {
    const originalSecret = process.env.BRIDGE_SECRET;
    process.env.BRIDGE_SECRET = "";
    const invalidJson = await asHttpAction(events.ingest)(
      { runMutation: vi.fn() } as never,
      new Request("https://example.test/ingest", {
        method: "POST",
        body: "{",
      })
    );
    expect(invalidJson.status).toBe(400);
    process.env.BRIDGE_SECRET = originalSecret;
  });

  describe("new event types", () => {
    it("summarizes session_start events", async () => {
      const ctx = createMockCtx();
      await ctx.db.insert("events", {
        eventId: "evt_session_start",
        eventType: "session_start",
        agentId: "agent_1",
        sessionKey: "session_1",
        timestamp: new Date().toISOString(),
        sequence: 1,
        payload: { sessionKey: "session_1", agentId: "agent_1" },
        receivedAt: Date.now(),
      });

      const recent = await asHandler(events.listRecent)._handler(ctx, { limit: 10 });
      const sessionStart = recent.find((e: { type: string }) => e.type === "session_start");

      expect(sessionStart).toBeDefined();
      expect(sessionStart?.content).toContain("Session started");
      expect(sessionStart?.content).toContain("session_1");
    });

    it("summarizes session_end events with duration", async () => {
      const ctx = createMockCtx();
      await ctx.db.insert("events", {
        eventId: "evt_session_end",
        eventType: "session_end",
        agentId: "agent_1",
        sessionKey: "session_1",
        timestamp: new Date().toISOString(),
        sequence: 2,
        payload: { sessionKey: "session_1", durationMs: 5500, messageCount: 15 },
        receivedAt: Date.now(),
      });

      const recent = await asHandler(events.listRecent)._handler(ctx, { limit: 10 });
      const sessionEnd = recent.find((e: { type: string }) => e.type === "session_end");

      expect(sessionEnd).toBeDefined();
      expect(sessionEnd?.content).toContain("Session ended");
      expect(sessionEnd?.content).toContain("5.5s");
      expect(sessionEnd?.content).toContain("15 messages");
    });

    it("summarizes memory_operation events", async () => {
      const ctx = createMockCtx();
      await ctx.db.insert("events", {
        eventId: "evt_memory_read",
        eventType: "memory_operation",
        agentId: "agent_1",
        sessionKey: "session_1",
        timestamp: new Date().toISOString(),
        sequence: 1,
        payload: { operation: "read", memoryType: "working", key: "context", success: true },
        receivedAt: Date.now(),
      });
      await ctx.db.insert("events", {
        eventId: "evt_memory_write_fail",
        eventType: "memory_operation",
        agentId: "agent_1",
        sessionKey: "session_1",
        timestamp: new Date().toISOString(),
        sequence: 2,
        payload: { operation: "write", memoryType: "long_term", success: false },
        receivedAt: Date.now(),
      });

      const recent = await asHandler(events.listRecent)._handler(ctx, { limit: 10 });
      const memoryRead = recent.find(
        (e: { type: string; content: string }) =>
          e.type === "memory_operation" && e.content.includes("read")
      );
      const memoryWriteFail = recent.find(
        (e: { type: string; content: string }) =>
          e.type === "memory_operation" && e.content.includes("FAILED")
      );

      expect(memoryRead?.content).toContain("Memory read");
      expect(memoryRead?.content).toContain("working");
      expect(memoryWriteFail?.content).toContain("Memory write");
      expect(memoryWriteFail?.content).toContain("[FAILED]");
    });

    it("includes new event types in countsByType", async () => {
      const ctx = createMockCtx();
      await ctx.db.insert("events", {
        eventId: "evt_session_start_1",
        eventType: "session_start",
        agentId: "agent_1",
        sessionKey: "session_1",
        timestamp: new Date().toISOString(),
        sequence: 1,
        payload: {},
        receivedAt: Date.now(),
      });
      await ctx.db.insert("events", {
        eventId: "evt_memory_op_1",
        eventType: "memory_operation",
        agentId: "agent_1",
        sessionKey: "session_1",
        timestamp: new Date().toISOString(),
        sequence: 2,
        payload: { operation: "read" },
        receivedAt: Date.now(),
      });

      const counts = await asHandler(events.countsByType)._handler(ctx, {});

      expect(counts.session_start).toBe(1);
      expect(counts.memory_operation).toBe(1);
    });

    it("routes new event types through ingest", async () => {
      const originalSecret = process.env.BRIDGE_SECRET;
      process.env.BRIDGE_SECRET = "";
      const ctx = { runMutation: vi.fn(async () => {}) };
      const payload = [
        {
          eventId: "evt_session_start",
          eventType: "session_start",
          agentId: "agent_1",
          sessionKey: "session_1",
          timestamp: new Date().toISOString(),
          sequence: 1,
          payload: { sessionKey: "session_1" },
        },
        {
          eventId: "evt_session_end",
          eventType: "session_end",
          agentId: "agent_1",
          sessionKey: "session_1",
          timestamp: new Date().toISOString(),
          sequence: 2,
          payload: { sessionKey: "session_1", durationMs: 1000 },
        },
        {
          eventId: "evt_thinking",
          eventType: "thinking",
          agentId: "agent_1",
          sessionKey: "session_1",
          timestamp: new Date().toISOString(),
          sequence: 3,
          payload: { content: "Analyzing the problem..." },
        },
        {
          eventId: "evt_memory",
          eventType: "memory_operation",
          agentId: "agent_1",
          sessionKey: "session_1",
          timestamp: new Date().toISOString(),
          sequence: 4,
          payload: { operation: "write", memoryType: "working" },
        },
      ];

      const response = await asHttpAction(events.ingest)(
        ctx as never,
        new Request("https://example.test/ingest", {
          method: "POST",
          body: JSON.stringify(payload),
        })
      );

      expect(response.status).toBe(200);
      expect(ctx.runMutation).toHaveBeenCalledWith(
        internal.events.startSession,
        expect.objectContaining({ sessionKey: "session_1" })
      );
      expect(ctx.runMutation).toHaveBeenCalledWith(
        internal.events.endSession,
        expect.objectContaining({ sessionKey: "session_1" })
      );
      expect(ctx.runMutation).toHaveBeenCalledWith(
        internal.events.incrementSessionThinkingCount,
        expect.objectContaining({ sessionKey: "session_1" })
      );
      expect(ctx.runMutation).toHaveBeenCalledWith(
        internal.events.recordMemoryOperation,
        expect.objectContaining({ sessionKey: "session_1" })
      );
      process.env.BRIDGE_SECRET = originalSecret;
    });

    it("routes tool and error events to session metrics", async () => {
      const originalSecret = process.env.BRIDGE_SECRET;
      process.env.BRIDGE_SECRET = "";
      const ctx = { runMutation: vi.fn(async () => {}) };
      const payload = [
        {
          eventId: "evt_tool",
          eventType: "tool_call",
          agentId: "agent_1",
          sessionKey: "session_1",
          timestamp: new Date().toISOString(),
          sequence: 1,
          payload: { toolName: "search", durationMs: 100 },
        },
        {
          eventId: "evt_error",
          eventType: "error",
          agentId: "agent_1",
          sessionKey: "session_1",
          timestamp: new Date().toISOString(),
          sequence: 2,
          payload: { message: "Something went wrong" },
        },
        {
          eventId: "evt_tokens",
          eventType: "token_usage",
          agentId: "agent_1",
          sessionKey: "session_1",
          timestamp: new Date().toISOString(),
          sequence: 3,
          payload: { inputTokens: 100, outputTokens: 50 },
        },
      ];

      const response = await asHttpAction(events.ingest)(
        ctx as never,
        new Request("https://example.test/ingest", {
          method: "POST",
          body: JSON.stringify(payload),
        })
      );

      expect(response.status).toBe(200);
      expect(ctx.runMutation).toHaveBeenCalledWith(
        internal.events.incrementSessionToolCount,
        expect.objectContaining({ sessionKey: "session_1" })
      );
      expect(ctx.runMutation).toHaveBeenCalledWith(
        internal.events.incrementSessionErrorCount,
        expect.objectContaining({ sessionKey: "session_1" })
      );
      expect(ctx.runMutation).toHaveBeenCalledWith(
        internal.events.addSessionTokenUsage,
        expect.objectContaining({ sessionKey: "session_1" })
      );
      process.env.BRIDGE_SECRET = originalSecret;
    });
  });

  describe("session metrics", () => {
    it("creates session metrics on session start", async () => {
      const ctx = createMockCtx();
      const now = Date.now();

      await asHandler(events.startSession)._handler(ctx, {
        agentId: "agent_1",
        sessionKey: "session_new",
        startedAt: now,
      });

      const metrics = await asHandler(events.getSessionMetrics)._handler(ctx, {
        sessionKey: "session_new",
      });

      expect(metrics).toBeDefined();
      expect(metrics?.sessionKey).toBe("session_new");
      expect(metrics?.agentId).toBe("agent_1");
      expect(metrics?.status).toBe("active");
      expect(metrics?.messageCount).toBe(0);
      expect(metrics?.toolCallCount).toBe(0);
      expect(metrics?.errorCount).toBe(0);
    });

    it("updates session metrics on session end", async () => {
      const ctx = createMockCtx();
      const now = Date.now();

      await asHandler(events.startSession)._handler(ctx, {
        agentId: "agent_1",
        sessionKey: "session_end_test",
        startedAt: now - 5000,
      });

      await asHandler(events.endSession)._handler(ctx, {
        agentId: "agent_1",
        sessionKey: "session_end_test",
        endedAt: now,
        payload: { durationMs: 5000 },
      });

      const metrics = await asHandler(events.getSessionMetrics)._handler(ctx, {
        sessionKey: "session_end_test",
      });

      expect(metrics?.status).toBe("completed");
      expect(metrics?.durationMs).toBe(5000);
      expect(metrics?.endedAt).toBe(now);
    });

    it("increments tool call count and tracks duration", async () => {
      const ctx = createMockCtx();
      const now = Date.now();

      await asHandler(events.startSession)._handler(ctx, {
        agentId: "agent_1",
        sessionKey: "session_tools",
        startedAt: now,
      });

      await asHandler(events.incrementSessionToolCount)._handler(ctx, {
        sessionKey: "session_tools",
        payload: { toolName: "search", durationMs: 100 },
      });

      await asHandler(events.incrementSessionToolCount)._handler(ctx, {
        sessionKey: "session_tools",
        payload: { toolName: "read", durationMs: 200 },
      });

      const metrics = await asHandler(events.getSessionMetrics)._handler(ctx, {
        sessionKey: "session_tools",
      });

      expect(metrics?.toolCallCount).toBe(2);
      expect(metrics?.maxToolDurationMs).toBe(200);
      expect(metrics?.avgToolDurationMs).toBe(150);
    });

    it("increments error and thinking counts", async () => {
      const ctx = createMockCtx();
      const now = Date.now();

      await asHandler(events.startSession)._handler(ctx, {
        agentId: "agent_1",
        sessionKey: "session_counts",
        startedAt: now,
      });

      await asHandler(events.incrementSessionErrorCount)._handler(ctx, {
        sessionKey: "session_counts",
      });
      await asHandler(events.incrementSessionErrorCount)._handler(ctx, {
        sessionKey: "session_counts",
      });
      await asHandler(events.incrementSessionThinkingCount)._handler(ctx, {
        sessionKey: "session_counts",
      });

      const metrics = await asHandler(events.getSessionMetrics)._handler(ctx, {
        sessionKey: "session_counts",
      });

      expect(metrics?.errorCount).toBe(2);
      expect(metrics?.thinkingEventCount).toBe(1);
    });

    it("accumulates token usage", async () => {
      const ctx = createMockCtx();
      const now = Date.now();

      await asHandler(events.startSession)._handler(ctx, {
        agentId: "agent_1",
        sessionKey: "session_tokens",
        startedAt: now,
      });

      await asHandler(events.addSessionTokenUsage)._handler(ctx, {
        sessionKey: "session_tokens",
        payload: { inputTokens: 100, outputTokens: 50 },
      });
      await asHandler(events.addSessionTokenUsage)._handler(ctx, {
        sessionKey: "session_tokens",
        payload: { inputTokens: 200, outputTokens: 100, costUsd: 0.01 },
      });

      const metrics = await asHandler(events.getSessionMetrics)._handler(ctx, {
        sessionKey: "session_tokens",
      });

      expect(metrics?.totalInputTokens).toBe(300);
      expect(metrics?.totalOutputTokens).toBe(150);
      expect(metrics?.estimatedCostUsd).toBe(0.01);
    });

    it("records memory operations", async () => {
      const ctx = createMockCtx();
      const now = Date.now();

      await asHandler(events.startSession)._handler(ctx, {
        agentId: "agent_1",
        sessionKey: "session_memory",
        startedAt: now,
      });

      await asHandler(events.recordMemoryOperation)._handler(ctx, {
        sessionKey: "session_memory",
        payload: { operation: "read" },
      });
      await asHandler(events.recordMemoryOperation)._handler(ctx, {
        sessionKey: "session_memory",
        payload: { operation: "write" },
      });
      await asHandler(events.recordMemoryOperation)._handler(ctx, {
        sessionKey: "session_memory",
        payload: { operation: "sync" },
      });

      const metrics = await asHandler(events.getSessionMetrics)._handler(ctx, {
        sessionKey: "session_memory",
      });

      expect(metrics?.memoryReadCount).toBe(1);
      expect(metrics?.memoryWriteCount).toBe(2);
    });

    it("lists session metrics by agent", async () => {
      const ctx = createMockCtx();
      const now = Date.now();

      await asHandler(events.startSession)._handler(ctx, {
        agentId: "agent_list_1",
        sessionKey: "session_list_1",
        startedAt: now - 2000,
      });
      await asHandler(events.startSession)._handler(ctx, {
        agentId: "agent_list_1",
        sessionKey: "session_list_2",
        startedAt: now - 1000,
      });
      await asHandler(events.startSession)._handler(ctx, {
        agentId: "agent_list_2",
        sessionKey: "session_list_3",
        startedAt: now,
      });

      const agent1Sessions = await asHandler(events.listSessionMetrics)._handler(ctx, {
        agentId: "agent_list_1",
      });

      expect(agent1Sessions).toHaveLength(2);
      expect(agent1Sessions.every((s: { agentId: string }) => s.agentId === "agent_list_1")).toBe(true);
    });
  });

  describe("store with denormalized fields", () => {
    it("extracts toolName from tool_call events", async () => {
      const ctx = createMockCtx();
      await asHandler(events.store)._handler(ctx, {
        eventId: "evt_tool_denorm",
        eventType: "tool_call",
        agentId: "agent_1",
        sessionKey: "session_1",
        timestamp: new Date().toISOString(),
        sequence: 1,
        payload: { toolName: "search", durationMs: 150 },
      });

      const stored = await ctx.db
        .query("events")
        .withIndex("by_event_id", (q: { eq: (field: string, value: string) => unknown }) => q.eq("eventId", "evt_tool_denorm"))
        .first();

      expect(stored?.toolName).toBe("search");
      expect(stored?.durationMs).toBe(150);
    });

    it("extracts errorCode from error events", async () => {
      const ctx = createMockCtx();
      await asHandler(events.store)._handler(ctx, {
        eventId: "evt_error_denorm",
        eventType: "error",
        agentId: "agent_1",
        sessionKey: "session_1",
        timestamp: new Date().toISOString(),
        sequence: 1,
        payload: { message: "Failed", code: "ERR_TIMEOUT" },
      });

      const stored = await ctx.db
        .query("events")
        .withIndex("by_event_id", (q: { eq: (field: string, value: string) => unknown }) => q.eq("eventId", "evt_error_denorm"))
        .first();

      expect(stored?.errorCode).toBe("ERR_TIMEOUT");
    });
  });
});
