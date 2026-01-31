import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as events from "./events";
import { createMockCtx } from "@/test/convex-test-utils";

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

    const byAgent = await events.listByAgent._handler(ctx, { agentId });

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

    const all = await events.listRecent._handler(ctx, { limit: 10 });
    const filtered = await events.listRecent._handler(ctx, { type: "heartbeat" });

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

    const counts = await events.countsByType._handler(ctx, { since: Date.now() - 500 });
    expect(counts.agent).toBe(1);
  });
});
