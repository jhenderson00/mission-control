import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as decisions from "./decisions";
import { createMockCtx, asHandler } from "@/test/convex-test-utils";

describe("decisions functions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists decisions by agent and task", async () => {
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

    await ctx.db.insert("decisions", {
      agentId,
      taskId,
      decision: "Do it",
      reasoning: "Because",
      outcome: "pending",
      createdAt: Date.now(),
    });

    const byAgent = await asHandler(decisions.listByAgent)._handler(ctx, { agentId: agentId as never });
    const byTask = await asHandler(decisions.listByTask)._handler(ctx, { taskId: taskId as never });

    expect(byAgent).toHaveLength(1);
    expect(byTask).toHaveLength(1);
  });

  it("lists recent decisions with outcome filter", async () => {
    const ctx = createMockCtx();
    await ctx.db.insert("decisions", {
      agentId: "agent_1",
      decision: "Accept",
      reasoning: "Ok",
      outcome: "accepted",
      createdAt: Date.now(),
    });
    await ctx.db.insert("decisions", {
      agentId: "agent_2",
      decision: "Reject",
      reasoning: "No",
      outcome: "pending",
      createdAt: Date.now(),
    });

    const all = await asHandler(decisions.listRecent)._handler(ctx, { limit: 10 });
    const accepted = await asHandler(decisions.listRecent)._handler(ctx, { outcome: "accepted" });

    expect(all).toHaveLength(2);
    expect(accepted).toHaveLength(1);
  });

  it("builds a decision chain", async () => {
    const ctx = createMockCtx();
    const rootId = await ctx.db.insert("decisions", {
      agentId: "agent_1",
      decision: "Root",
      reasoning: "Root reason",
      outcome: "pending",
      createdAt: Date.now(),
    });
    const childId = await ctx.db.insert("decisions", {
      agentId: "agent_1",
      decision: "Child",
      reasoning: "Child reason",
      outcome: "pending",
      parentDecisionId: rootId,
      createdAt: Date.now(),
    });

    const result = await asHandler(decisions.getWithChain)._handler(ctx, { id: childId as never });
    expect(result?.chain).toHaveLength(2);
    expect(result?.chain[0]._id).toBe(rootId);
  });

  it("counts pending decisions", async () => {
    const ctx = createMockCtx();
    ctx.db.seed("decisions", [
      { outcome: "pending" },
      { outcome: "accepted" },
    ]);

    const count = await asHandler(decisions.pendingCount)._handler(ctx, {});
    expect(count).toBe(1);
  });

  it("records and resolves decisions", async () => {
    const ctx = createMockCtx();
    const id = await asHandler(decisions.record)._handler(ctx, {
      agentId: "agent_1" as never,
      decision: "Do",
      reasoning: "Why",
    });

    let created = await ctx.db.get(id);
    expect(created?.outcome).toBe("pending");

    await asHandler(decisions.resolve)._handler(ctx, { id: id as never, outcome: "accepted" });
    created = await ctx.db.get(id);
    expect(created?.outcome).toBe("accepted");
    expect(created?.decidedAt).toBe(Date.now());
  });
});
