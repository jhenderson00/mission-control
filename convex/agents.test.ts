import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as agents from "./agents";
import { createMockCtx } from "@/test/convex-test-utils";

describe("agents functions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists agents with optional status filter", async () => {
    const ctx = createMockCtx();
    ctx.db.seed("agents", [
      {
        name: "Alpha",
        status: "active",
        type: "executor",
        model: "m1",
        host: "local",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        name: "Beta",
        status: "idle",
        type: "planner",
        model: "m2",
        host: "local",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    const all = await agents.list._handler(ctx, {});
    const active = await agents.list._handler(ctx, { status: "active" });

    expect(all).toHaveLength(2);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe("Alpha");
  });

  it("gets an agent by id", async () => {
    const ctx = createMockCtx();
    const id = await ctx.db.insert("agents", {
      name: "Gamma",
      status: "active",
      type: "executor",
      model: "m3",
      host: "local",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const agent = await agents.get._handler(ctx, { id: id as never });
    expect(agent?.name).toBe("Gamma");
  });

  it("lists agents with their current tasks", async () => {
    const ctx = createMockCtx();
    const taskId = await ctx.db.insert("tasks", {
      title: "Task A",
      status: "active",
      assignedAgentIds: [],
      requester: "system",
      priority: "high",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("agents", {
      name: "Alpha",
      status: "active",
      type: "executor",
      model: "m1",
      host: "local",
      currentTaskId: taskId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const result = await agents.listWithTasks._handler(ctx, {});
    expect(result[0].currentTask?.title).toBe("Task A");
  });

  it("computes status counts", async () => {
    const ctx = createMockCtx();
    ctx.db.seed("agents", [
      { status: "active" },
      { status: "active" },
      { status: "idle" },
    ]);

    const counts = await agents.statusCounts._handler(ctx, {});
    expect(counts.total).toBe(3);
    expect(counts.active).toBe(2);
    expect(counts.idle).toBe(1);
  });

  it("creates an agent", async () => {
    const ctx = createMockCtx();
    const id = await agents.create._handler(ctx, {
      name: "Delta",
      type: "planner",
      model: "m4",
      host: "local",
    });

    const created = await ctx.db.get(id);
    expect(created?.status).toBe("idle");
    expect(created?.createdAt).toBe(Date.now());
  });

  it("updates agent status and task", async () => {
    const ctx = createMockCtx();
    const taskId = await ctx.db.insert("tasks", {
      title: "Task B",
      status: "queued",
      assignedAgentIds: [],
      requester: "system",
      priority: "medium",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const id = await ctx.db.insert("agents", {
      name: "Echo",
      status: "idle",
      type: "executor",
      model: "m5",
      host: "local",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      currentTaskId: taskId,
    });

    await agents.updateStatus._handler(ctx, {
      id: id as never,
      status: "active",
    });

    const updated = await ctx.db.get(id);
    expect(updated?.status).toBe("active");
    expect(updated?.startedAt).toBe(Date.now());
  });

  it("removes an agent", async () => {
    const ctx = createMockCtx();
    const id = await ctx.db.insert("agents", {
      name: "Foxtrot",
      status: "idle",
      type: "executor",
      model: "m6",
      host: "local",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await agents.remove._handler(ctx, { id: id as never });
    const removed = await ctx.db.get(id);
    expect(removed).toBeNull();
  });
});
