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

  it("computes presence counts from latest agent status", async () => {
    const ctx = createMockCtx();
    ctx.db.seed("agentStatus", [
      {
        agentId: "agent_alpha",
        status: "online",
        lastHeartbeat: 100,
        lastActivity: 100,
      },
      {
        agentId: "agent_bravo",
        status: "busy",
        lastHeartbeat: 200,
        lastActivity: 200,
      },
      {
        agentId: "agent_alpha",
        status: "offline",
        lastHeartbeat: 50,
        lastActivity: 50,
      },
      {
        agentId: "agent_charlie",
        status: "paused",
        lastHeartbeat: 300,
        lastActivity: 300,
      },
    ]);

    const counts = await agents.presenceCounts._handler(ctx, {});
    expect(counts.total).toBe(3);
    expect(counts.online).toBe(1);
    expect(counts.busy).toBe(1);
    expect(counts.paused).toBe(1);
    expect(counts.offline).toBe(0);
    expect(counts.active).toBe(2);
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

  it("updates status from presence entries", async () => {
    const ctx = createMockCtx();
    await agents.updateStatusFromEvent._handler(ctx, {
      eventId: "evt_presence",
      eventType: "presence",
      agentId: "agent_primary",
      sessionKey: "session_presence",
      timestamp: new Date().toISOString(),
      sequence: 1,
      payload: {
        entries: [
          {
            deviceId: "agent_alpha",
            lastSeen: new Date().toISOString(),
          },
        ],
      },
    });

    const statuses = await ctx.db.query("agentStatus").collect();
    expect(statuses).toHaveLength(1);
    expect(statuses[0].agentId).toBe("agent_alpha");
    expect(statuses[0].status).toBe("online");
  });

  it("updates status from heartbeat events", async () => {
    const ctx = createMockCtx();
    await agents.updateStatusFromEvent._handler(ctx, {
      eventId: "evt_heartbeat",
      eventType: "heartbeat",
      agentId: "agent_heartbeat",
      sessionKey: "session_heartbeat",
      timestamp: new Date().toISOString(),
      sequence: 2,
      payload: { status: "ok" },
    });

    const statuses = await ctx.db.query("agentStatus").collect();
    expect(statuses).toHaveLength(1);
    expect(statuses[0].agentId).toBe("agent_heartbeat");
  });

  it("updates presence status and clears sessions on offline", async () => {
    const ctx = createMockCtx();
    await agents.updateAgentStatus._handler(ctx, {
      agentId: "agent_online",
      status: "online",
      lastSeen: Date.now(),
      sessionInfo: { sessionKey: "session_alpha" },
    });

    await agents.updateAgentStatus._handler(ctx, {
      agentId: "agent_busy",
      status: "busy",
      lastSeen: Date.now(),
      sessionInfo: { session_id: "session_beta" },
    });

    await agents.updateAgentStatus._handler(ctx, {
      agentId: "agent_online",
      status: "offline",
      lastSeen: Date.now() + 5000,
    });

    const statuses = await ctx.db.query("agentStatus").collect();
    const online = statuses.find((status) => status.agentId === "agent_online");
    const busy = statuses.find((status) => status.agentId === "agent_busy");

    expect(online?.status).toBe("offline");
    expect(online?.currentSession).toBeUndefined();
    expect(online?.sessionInfo).toEqual({ sessionKey: "session_alpha" });
    expect(busy?.currentSession).toBe("session_beta");
  });

  it("preserves paused or busy status on heartbeat", async () => {
    const ctx = createMockCtx();
    await ctx.db.insert("agentStatus", {
      agentId: "agent_paused",
      status: "paused",
      lastHeartbeat: Date.now(),
      lastActivity: Date.now(),
    });
    await ctx.db.insert("agentStatus", {
      agentId: "agent_busy",
      status: "busy",
      lastHeartbeat: Date.now(),
      lastActivity: Date.now(),
    });

    await agents.updateStatusFromEvent._handler(ctx, {
      eventId: "evt_heartbeat_paused",
      eventType: "heartbeat",
      agentId: "agent_paused",
      sessionKey: "session_paused",
      timestamp: new Date().toISOString(),
      sequence: 3,
      payload: { status: "ok" },
    });

    await agents.updateStatusFromEvent._handler(ctx, {
      eventId: "evt_heartbeat_busy",
      eventType: "heartbeat",
      agentId: "agent_busy",
      sessionKey: "session_busy",
      timestamp: new Date().toISOString(),
      sequence: 4,
      payload: { status: "ok" },
    });

    const statuses = await ctx.db.query("agentStatus").collect();
    const paused = statuses.find((status) => status.agentId === "agent_paused");
    const busy = statuses.find((status) => status.agentId === "agent_busy");

    expect(paused?.status).toBe("paused");
    expect(busy?.status).toBe("busy");
  });

  it("updates agent status with a current task", async () => {
    const ctx = createMockCtx();
    const taskId = await ctx.db.insert("tasks", {
      title: "Task C",
      status: "active",
      assignedAgentIds: [],
      requester: "system",
      priority: "high",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const id = await ctx.db.insert("agents", {
      name: "Golf",
      status: "idle",
      type: "executor",
      model: "m7",
      host: "local",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await agents.updateStatus._handler(ctx, {
      id: id as never,
      status: "active",
      currentTaskId: taskId as never,
    });

    const updated = await ctx.db.get(id);
    expect(updated?.currentTaskId).toBe(taskId);
  });

  it("handles status update http payloads", async () => {
    const originalSecret = process.env.BRIDGE_SECRET;
    process.env.BRIDGE_SECRET = "secret";
    const ctx = { runMutation: vi.fn(async () => {}) };

    const unauthorized = await agents.updateAgentStatusHttp(
      ctx as never,
      new Request("https://example.test/status", { method: "POST", body: "{}" })
    );
    expect(unauthorized.status).toBe(401);

    const invalidJson = await agents.updateAgentStatusHttp(
      ctx as never,
      new Request("https://example.test/status", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
        body: "{",
      })
    );
    expect(invalidJson.status).toBe(400);

    const invalidPayload = await agents.updateAgentStatusHttp(
      ctx as never,
      new Request("https://example.test/status", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
        body: "{}",
      })
    );
    expect(invalidPayload.status).toBe(400);

    const validPayload = await agents.updateAgentStatusHttp(
      ctx as never,
      new Request("https://example.test/status", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
        body: JSON.stringify([
          {
            agentId: "agent_ok",
            status: "online",
            lastSeen: Date.now(),
            sessionInfo: { sessionKey: "session_ok" },
          },
          {
            agentId: "agent_ok_2",
            status: "paused",
            lastSeen: Date.now(),
          },
        ]),
      })
    );

    expect(validPayload.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledTimes(2);

    process.env.BRIDGE_SECRET = originalSecret;
  });
});
