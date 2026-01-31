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

  it("lists events by agent and task", async () => {
    const ctx = createMockCtx();
    const agentId = await ctx.db.insert("agents", {
      name: "Agent",
      status: "active",
      type: "executor",
      model: "m1",
      host: "local",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const taskId = await ctx.db.insert("tasks", {
      title: "Task",
      status: "active",
      requester: "system",
      priority: "high",
      assignedAgentIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("events", {
      agentId,
      taskId,
      type: "message",
      content: "Hello",
      createdAt: Date.now(),
    });

    const byAgent = await events.listByAgent._handler(ctx, { agentId: agentId as never });
    const byTask = await events.listByTask._handler(ctx, { taskId: taskId as never });

    expect(byAgent).toHaveLength(1);
    expect(byTask).toHaveLength(1);
  });

  it("lists recent events with optional type filter", async () => {
    const ctx = createMockCtx();
    await ctx.db.insert("events", {
      agentId: "agent_1",
      type: "error",
      content: "Oops",
      createdAt: Date.now(),
    });
    await ctx.db.insert("events", {
      agentId: "agent_2",
      type: "message",
      content: "Hi",
      createdAt: Date.now(),
    });

    const all = await events.listRecent._handler(ctx, { limit: 10 });
    const filtered = await events.listRecent._handler(ctx, { type: "error" });

    expect(all).toHaveLength(2);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].type).toBe("error");
  });

  it("counts events by type with since filter", async () => {
    const ctx = createMockCtx();
    await ctx.db.insert("events", {
      agentId: "agent_1",
      type: "message",
      content: "One",
      createdAt: Date.now() - 1000,
    });
    await ctx.db.insert("events", {
      agentId: "agent_1",
      type: "message",
      content: "Two",
      createdAt: Date.now(),
    });

    const counts = await events.countsByType._handler(ctx, { since: Date.now() - 500 });
    expect(counts.message).toBe(1);
  });

  it("logs a new event", async () => {
    const ctx = createMockCtx();
    const id = await events.log._handler(ctx, {
      agentId: "agent_1" as never,
      type: "status_change",
      content: "Updated",
    });

    const created = await ctx.db.get(id);
    expect(created?.type).toBe("status_change");
  });
});
