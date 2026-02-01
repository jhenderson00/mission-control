import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as subscriptions from "./subscriptions";
import * as taskComments from "./taskComments";
import * as tasks from "./tasks";
import { createMockCtx } from "@/test/convex-test-utils";

describe("task subscription functions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("subscribes and unsubscribes idempotently", async () => {
    const ctx = createMockCtx();
    const taskId = await ctx.db.insert("tasks", {
      title: "Task A",
      status: "queued",
      requester: "system",
      priority: "low",
      assignedAgentIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const first = await subscriptions.subscribe._handler(ctx, {
      taskId: taskId as never,
      subscriberType: "user",
      subscriberId: "user_1",
    });
    const second = await subscriptions.subscribe._handler(ctx, {
      taskId: taskId as never,
      subscriberType: "user",
      subscriberId: "user_1",
    });

    expect(first.existing).toBe(false);
    expect(second.existing).toBe(true);

    const records = await ctx.db.query("taskSubscriptions").collect();
    expect(records).toHaveLength(1);

    const subscribed = await subscriptions.isSubscribed._handler(ctx, {
      taskId: taskId as never,
      subscriberType: "user",
      subscriberId: "user_1",
    });
    expect(subscribed).toBe(true);

    const removal = await subscriptions.unsubscribe._handler(ctx, {
      taskId: taskId as never,
      subscriberType: "user",
      subscriberId: "user_1",
    });
    expect(removal.removed).toBe(true);

    const remaining = await ctx.db.query("taskSubscriptions").collect();
    expect(remaining).toHaveLength(0);
  });

  it("auto-subscribes assigned agents", async () => {
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
    const taskId = await ctx.db.insert("tasks", {
      title: "Task B",
      status: "queued",
      requester: "system",
      priority: "medium",
      assignedAgentIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await tasks.assignAgents._handler(ctx, {
      id: taskId as never,
      agentIds: [agentId as never],
    });

    const records = await ctx.db.query("taskSubscriptions").collect();
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(
      expect.objectContaining({
        taskId,
        subscriberType: "agent",
        subscriberId: agentId,
      })
    );
  });

  it("auto-subscribes commenters and mentions", async () => {
    const ctx = createMockCtx();
    const taskId = await ctx.db.insert("tasks", {
      title: "Task C",
      status: "queued",
      requester: "system",
      priority: "high",
      assignedAgentIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await taskComments.addComment._handler(ctx, {
      taskId: taskId as never,
      body: "Looping in @user_2 and @agent:agent_1.",
      authorType: "user",
      authorId: "user_1",
    });

    const records = await ctx.db.query("taskSubscriptions").collect();
    expect(records).toHaveLength(3);

    const keys = records.map((record) => `${record.subscriberType}:${record.subscriberId}`);
    expect(keys).toContain("user:user_1");
    expect(keys).toContain("user:user_2");
    expect(keys).toContain("agent:agent_1");
  });
});
