import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as tasks from "./tasks";
import { createMockCtx, asHandler } from "@/test/convex-test-utils";

describe("tasks functions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists tasks with status filter and limit", async () => {
    const ctx = createMockCtx();
    ctx.db.seed("tasks", [
      { title: "A", status: "queued" },
      { title: "B", status: "active" },
      { title: "C", status: "active" },
    ]);

    const active = await asHandler(tasks.list)._handler(ctx, { status: "active" });
    const limited = await asHandler(tasks.list)._handler(ctx, { limit: 1 });

    expect(active).toHaveLength(2);
    expect(limited).toHaveLength(1);
  });

  it("gets a task by id", async () => {
    const ctx = createMockCtx();
    const id = await ctx.db.insert("tasks", {
      title: "Task X",
      status: "queued",
      requester: "system",
      priority: "low",
      assignedAgentIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const task = await asHandler(tasks.get)._handler(ctx, { id: id as never });
    expect(task?.title).toBe("Task X");
  });

  it("computes task status counts", async () => {
    const ctx = createMockCtx();
    ctx.db.seed("tasks", [
      { status: "queued" },
      { status: "blocked" },
      { status: "completed" },
    ]);

    const counts = await asHandler(tasks.statusCounts)._handler(ctx, {});
    expect(counts.total).toBe(3);
    expect(counts.blocked).toBe(1);
    expect(counts.completed).toBe(1);
  });

  it("lists tasks with assigned agents", async () => {
    const ctx = createMockCtx();
    const agentId = await ctx.db.insert("agents", {
      name: "Agent A",
      status: "active",
      type: "executor",
      model: "m1",
      host: "local",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("tasks", {
      title: "Task A",
      status: "queued",
      requester: "system",
      priority: "high",
      assignedAgentIds: [agentId],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const result = await asHandler(tasks.listWithAgents)._handler(ctx, { limit: 10 });
    expect(result[0].assignedAgents[0]?.name).toBe("Agent A");
  });

  it("creates a task", async () => {
    const ctx = createMockCtx();
    const id = await asHandler(tasks.create)._handler(ctx, {
      title: "Task New",
      requester: "system",
      priority: "medium",
    });

    const created = await ctx.db.get(id);
    expect(created?.status).toBe("queued");
    expect(created?.assignedAgentIds).toEqual([]);
  });

  it("updates task status timestamps", async () => {
    const ctx = createMockCtx();
    const id = await ctx.db.insert("tasks", {
      title: "Task Y",
      status: "queued",
      requester: "system",
      priority: "low",
      assignedAgentIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await asHandler(tasks.updateStatus)._handler(ctx, { id: id as never, status: "active" });
    let updated = await ctx.db.get(id);
    expect(updated?.startedAt).toBe(Date.now());

    await asHandler(tasks.updateStatus)._handler(ctx, { id: id as never, status: "completed" });
    updated = await ctx.db.get(id);
    expect(updated?.completedAt).toBe(Date.now());
  });

  it("assigns agents to a task", async () => {
    const ctx = createMockCtx();
    const agentId = await ctx.db.insert("agents", {
      name: "Agent B",
      status: "idle",
      type: "planner",
      model: "m2",
      host: "local",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const taskId = await ctx.db.insert("tasks", {
      title: "Task Z",
      status: "queued",
      requester: "system",
      priority: "low",
      assignedAgentIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await asHandler(tasks.assignAgents)._handler(ctx, { id: taskId as never, agentIds: [agentId as never] });
    const updated = await ctx.db.get(taskId);
    expect(updated?.assignedAgentIds).toEqual([agentId]);
  });
});
