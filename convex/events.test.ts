import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as events from "./events";
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

    const counts = await asHandler(events.countsByType)._handler(ctx, { since: Date.now() - 500 });
    expect(counts.agent).toBe(1);
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

    const recent = await asHandler(events.listRecent)._handler(ctx, { limit: 10 });
    const contents = recent.map((event: { content: string }) => event.content);

    expect(contents).toEqual(
      expect.arrayContaining([
        "Raw string payload",
        "Object content",
        "Delta content",
        "ok",
        "agent",
      ])
    );
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
});
