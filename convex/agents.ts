import { v } from "convex/values";
import { z } from "zod";
import type { Doc, Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { query, mutation, internalMutation, httpAction } from "./_generated/server";

const eventValidator = v.object({
  eventId: v.string(),
  eventType: v.string(),
  agentId: v.string(),
  sessionKey: v.optional(v.string()),
  timestamp: v.string(),
  sequence: v.number(),
  payload: v.any(),
});

const agentStatusValidator = v.union(
  v.literal("online"),
  v.literal("offline"),
  v.literal("busy"),
  v.literal("paused")
);

const presencePayloadSchema = z
  .object({
    entries: z
      .array(
        z.object({
          deviceId: z.string(),
          roles: z.array(z.string()).optional(),
          scopes: z.array(z.string()).optional(),
          connectedAt: z.string().optional(),
          lastSeen: z.string().optional(),
        })
      )
      .optional(),
  })
  .passthrough();

const statusUpdateSchema = z.object({
  agentId: z.string(),
  status: z.enum(["online", "offline", "busy", "paused"]),
  lastSeen: z.number(),
  sessionInfo: z.unknown().optional(),
});

const statusUpdateBatchSchema = z.union([statusUpdateSchema, z.array(statusUpdateSchema)]);

const workingMemorySchema = z.object({
  agentId: z.string(),
  currentTask: z.string(),
  status: z.string(),
  progress: z.string().optional(),
  nextSteps: z.array(z.string()).optional(),
});

const workingMemoryBatchSchema = z.union([
  workingMemorySchema,
  z.array(workingMemorySchema),
]);

function normalizeTimestamp(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function resolveString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function resolveSessionKeyFromInfo(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return (
    resolveString(record.sessionKey) ??
    resolveString(record.session_key) ??
    resolveString(record.sessionId) ??
    resolveString(record.session_id)
  );
}

async function upsertStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  status: {
    agentId: string;
    lastHeartbeat: number;
    lastActivity: number;
    currentSession?: string;
    status: "online" | "offline" | "busy" | "paused";
    sessionInfo?: unknown;
  }
  , options?: {
    existing?: Doc<"agentStatus"> | null;
    preservePaused?: boolean;
    preserveBusy?: boolean;
  }
): Promise<string> {
  const existing =
    options && "existing" in options
      ? options.existing
        ? [options.existing]
        : []
      : await ctx.db
          .query("agentStatus")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .withIndex("by_agent", (q: any) => q.eq("agentId", status.agentId))
          .take(1);

  const current = existing[0];
  let nextStatus = status.status;
  if (current) {
    if (options?.preservePaused && current.status === "paused" && nextStatus !== "offline") {
      nextStatus = "paused";
    }
    if (options?.preserveBusy && current.status === "busy" && nextStatus === "online") {
      nextStatus = "busy";
    }
  }

  const nextSessionInfo = status.sessionInfo ?? current?.sessionInfo;
  const nextCurrentSession =
    status.status === "offline"
      ? undefined
      : status.currentSession ?? current?.currentSession;
  const payload = {
    ...status,
    status: nextStatus,
    currentSession: nextCurrentSession,
    sessionInfo: nextSessionInfo,
  };

  if (current) {
    await ctx.db.patch(current._id, payload);
    return current._id;
  }

  return await ctx.db.insert("agentStatus", payload);
}

/**
 * Get all agents, optionally filtered by status
 */
export const list = query({
  args: {
    status: v.optional(v.union(
      v.literal("idle"),
      v.literal("active"),
      v.literal("blocked"),
      v.literal("failed")
    )),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      const status = args.status;
      return await ctx.db
        .query("agents")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .collect();
    }
    return await ctx.db.query("agents").order("desc").collect();
  },
});

/**
 * Get a single agent by ID
 */
export const get = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    // Try agents table first
    const agentId = ctx.db.normalizeId("agents", args.id);
    if (agentId) {
      return await ctx.db.get(agentId);
    }
    // Try agentStatus table (grid links use this)
    const statusId = ctx.db.normalizeId("agentStatus", args.id);
    if (statusId) {
      return await ctx.db.get(statusId);
    }
    // Fallback: search agentStatus by agentId string
    const statusByAgentId = await ctx.db
      .query("agentStatus")
      .filter((q) => q.eq(q.field("agentId"), args.id))
      .first();
    if (statusByAgentId) {
      return statusByAgentId;
    }
    return null;
  },
});

/**
 * Get agent status by ID (from agentStatus table)
 * Used by /agents/[id] detail pages
 */
export const getStatus = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    // Try agentStatus table first by document ID
    const statusId = ctx.db.normalizeId("agentStatus", args.id);
    if (statusId) {
      return await ctx.db.get(statusId);
    }
    // Try agents table by document ID
    const agentDocId = ctx.db.normalizeId("agents", args.id);
    if (agentDocId) {
      return await ctx.db.get(agentDocId);
    }
    // Fallback: search agentStatus by agentId string (e.g., "main")
    const statusByAgentId = await ctx.db
      .query("agentStatus")
      .filter((q) => q.eq(q.field("agentId"), args.id))
      .first();
    if (statusByAgentId) {
      return statusByAgentId;
    }
    return null;
  },
});

/**
 * Get agents with their current tasks
 */
export const listWithTasks = query({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db.query("agents").order("desc").collect();
    
    return Promise.all(
      agents.map(async (agent) => {
        const currentTask = agent.currentTaskId
          ? await ctx.db.get(agent.currentTaskId)
          : null;
        return { ...agent, currentTask };
      })
    );
  },
});

/**
 * Get agent status counts for dashboard
 */
export const statusCounts = query({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db.query("agents").collect();
    
    const counts: Record<string, number> = {
      total: agents.length,
      active: 0,
      idle: 0,
      blocked: 0,
      failed: 0,
    };
    
    for (const agent of agents) {
      const status = agent.status;
      if (typeof status === "string" && status in counts) {
        counts[status] += 1;
      }
    }
    
    return counts;
  },
});

/**
 * Get live presence counts from agentStatus.
 */
export const presenceCounts = query({
  args: {},
  handler: async (ctx): Promise<{
    total: number;
    online: number;
    offline: number;
    busy: number;
    paused: number;
    active: number;
  }> => {
    const statuses = await ctx.db.query("agentStatus").collect();
    const latestByAgent = new Map<string, Doc<"agentStatus">>();

    for (const status of statuses) {
      const timestamp = Math.max(status.lastActivity ?? 0, status.lastHeartbeat ?? 0);
      const existing = latestByAgent.get(status.agentId);
      if (!existing) {
        latestByAgent.set(status.agentId, status);
        continue;
      }
      const existingTimestamp = Math.max(
        existing.lastActivity ?? 0,
        existing.lastHeartbeat ?? 0
      );
      if (timestamp >= existingTimestamp) {
        latestByAgent.set(status.agentId, status);
      }
    }

    const counts = {
      total: latestByAgent.size,
      online: 0,
      offline: 0,
      busy: 0,
      paused: 0,
      active: 0,
    };

    for (const status of latestByAgent.values()) {
      switch (status.status) {
        case "online":
          counts.online += 1;
          counts.active += 1;
          break;
        case "busy":
          counts.busy += 1;
          counts.active += 1;
          break;
        case "paused":
          counts.paused += 1;
          break;
        case "offline":
          counts.offline += 1;
          break;
        default:
          break;
      }
    }

    return counts;
  },
});

/**
 * List materialized agent status from gateway events.
 */
export const listStatus = query({
  args: {
    agentIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<Array<Doc<"agentStatus">>> => {
    if (args.agentIds && args.agentIds.length > 0) {
      // Look up agents to get their bridgeAgentId mappings
      const agents = await Promise.all(
        args.agentIds.map(async (id) => {
          try {
            return await ctx.db.get(id as Id<"agents">);
          } catch {
            return null;
          }
        })
      );

      // Build map of bridgeAgentId -> convexAgentId for response mapping
      const bridgeToConvex = new Map<string, string>();
      const bridgeIds: string[] = [];
      
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const convexId = args.agentIds[i];
        if (agent?.bridgeAgentId) {
          bridgeIds.push(agent.bridgeAgentId);
          bridgeToConvex.set(agent.bridgeAgentId, convexId);
        } else {
          // Fallback: try using convexId directly as bridgeAgentId
          bridgeIds.push(convexId);
        }
      }

      // Query status by bridgeAgentIds
      const results = await Promise.all(
        bridgeIds.map((bridgeId) =>
          ctx.db
            .query("agentStatus")
            .withIndex("by_agent", (q) => q.eq("agentId", bridgeId))
            .take(1)
        )
      );

      // Map results back to convex agent IDs for UI consistency
      return results.flat().map((status) => {
        const convexId = bridgeToConvex.get(status.agentId);
        if (convexId) {
          return { ...status, agentId: convexId };
        }
        return status;
      });
    }

    return await ctx.db.query("agentStatus").collect();
  },
});

/**
 * List working memory snapshots, optionally scoped to specific agents.
 */
export const listWorkingMemory = query({
  args: {
    agentIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    if (args.agentIds && args.agentIds.length > 0) {
      const agents = await Promise.all(
        args.agentIds.map(async (id) => {
          try {
            return await ctx.db.get(id as Id<"agents">);
          } catch {
            return null;
          }
        })
      );

      const bridgeToConvex = new Map<string, string>();
      const bridgeIds: string[] = [];

      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const convexId = args.agentIds[i];
        if (agent?.bridgeAgentId) {
          bridgeIds.push(agent.bridgeAgentId);
          bridgeToConvex.set(agent.bridgeAgentId, convexId);
        } else {
          bridgeIds.push(convexId);
        }
      }

      const results = await Promise.all(
        bridgeIds.map((bridgeId) =>
          ctx.db
            .query("agentWorkingMemory")
            .withIndex("by_agent", (q) => q.eq("agentId", bridgeId))
            .take(1)
        )
      );

      return results.flat().map((memory) => {
        const convexId = bridgeToConvex.get(memory.agentId);
        if (convexId) {
          return { ...memory, agentId: convexId };
        }
        return memory;
      });
    }

    return await ctx.db.query("agentWorkingMemory").order("desc").collect();
  },
});

/**
 * Update or insert agent presence status.
 */
export const updateAgentStatus = mutation({
  args: {
    agentId: v.string(),
    status: agentStatusValidator,
    lastSeen: v.number(),
    sessionInfo: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query("agentStatus")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_agent", (q: any) => q.eq("agentId", args.agentId))
      .take(1);

    const current = existing[0] ?? null;
    const currentSession =
      args.status === "offline"
        ? undefined
        : resolveSessionKeyFromInfo(args.sessionInfo) ??
          current?.currentSession;

    await upsertStatus(
      ctx,
      {
        agentId: args.agentId,
        status: args.status,
        lastHeartbeat: args.lastSeen,
        lastActivity: args.lastSeen,
        currentSession,
        sessionInfo: args.sessionInfo ?? current?.sessionInfo,
      },
      { existing: current }
    );
  },
});

/**
 * Upsert agent working memory snapshot (WORKING.md sync).
 */
export const upsertWorkingMemory = mutation({
  args: {
    agentId: v.string(),
    currentTask: v.string(),
    status: v.string(),
    progress: v.optional(v.string()),
    nextSteps: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const workingMemory = {
      currentTask: args.currentTask,
      status: args.status,
      updatedAt: now,
      nextSteps: args.nextSteps ?? [],
      ...(args.progress !== undefined ? { progress: args.progress } : {}),
    };

    const existing = await ctx.db
      .query("agentWorkingMemory")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .take(1);

    const current = existing[0];
    let recordId: Id<"agentWorkingMemory">;
    if (current) {
      await ctx.db.patch(current._id, workingMemory);
      recordId = current._id;
    } else {
      recordId = await ctx.db.insert("agentWorkingMemory", {
        agentId: args.agentId,
        ...workingMemory,
        createdAt: now,
      });
    }

    const statusRecord = await ctx.db
      .query("agentStatus")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .take(1);

    if (statusRecord[0]) {
      await ctx.db.patch(statusRecord[0]._id, { workingMemory });
    }

    return await ctx.db.get(recordId);
  },
});

/**
 * HTTP endpoint for bridge-driven status updates.
 */
export const updateAgentStatusHttp = httpAction(
  async (ctx, request): Promise<Response> => {
    const expectedSecret = process.env.BRIDGE_SECRET;
    if (expectedSecret) {
      const authHeader = request.headers.get("authorization") ?? "";
      if (authHeader !== `Bearer ${expectedSecret}`) {
        return new Response("unauthorized", { status: 401 });
      }
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response("invalid json", { status: 400 });
    }

    const parsed = statusUpdateBatchSchema.safeParse(body);
    if (!parsed.success) {
      return new Response("invalid status payload", { status: 400 });
    }

    const updates = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
    await Promise.all(
      updates.map((update) =>
        ctx.runMutation(api.agents.updateAgentStatus, update)
      )
    );

    return new Response("ok");
  }
);

/**
 * HTTP endpoint for bridge-driven working memory sync (POST).
 */
export const upsertWorkingMemoryHttp = httpAction(
  async (ctx, request): Promise<Response> => {
    const expectedSecret = process.env.BRIDGE_SECRET;
    if (expectedSecret) {
      const authHeader = request.headers.get("authorization") ?? "";
      if (authHeader !== `Bearer ${expectedSecret}`) {
        return new Response("unauthorized", { status: 401 });
      }
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response("invalid json", { status: 400 });
    }

    const parsed = workingMemoryBatchSchema.safeParse(body);
    if (!parsed.success) {
      return new Response("invalid working memory payload", { status: 400 });
    }

    const updates = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
    await Promise.all(
      updates.map((update) =>
        ctx.runMutation(api.agents.upsertWorkingMemory, update)
      )
    );

    return new Response("ok");
  }
);

/**
 * HTTP endpoint for bridge-driven working memory fetch (GET).
 */
export const listWorkingMemoryHttp = httpAction(
  async (ctx, request): Promise<Response> => {
    const expectedSecret = process.env.BRIDGE_SECRET;
    if (expectedSecret) {
      const authHeader = request.headers.get("authorization") ?? "";
      if (authHeader !== `Bearer ${expectedSecret}`) {
        return new Response("unauthorized", { status: 401 });
      }
    }

    const url = new URL(request.url);
    const explicitAgentIds = url.searchParams.getAll("agentId");
    const agentIdsParam = url.searchParams.get("agentIds");
    const agentIds = [
      ...explicitAgentIds,
      ...(agentIdsParam
        ? agentIdsParam
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : []),
    ];

    const result = await ctx.runQuery(api.agents.listWorkingMemory, {
      agentIds: agentIds.length > 0 ? agentIds : undefined,
    });

    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json" },
    });
  }
);

/**
 * Create a new agent
 */
export const create = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal("coordinator"),
      v.literal("planner"),
      v.literal("executor"),
      v.literal("critic"),
      v.literal("specialist")
    ),
    model: v.string(),
    host: v.string(),
    sessionId: v.optional(v.string()),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("agents", {
      ...args,
      status: "idle",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update agent status
 */
export const updateStatus = mutation({
  args: {
    id: v.id("agents"),
    status: v.union(
      v.literal("idle"),
      v.literal("active"),
      v.literal("blocked"),
      v.literal("failed")
    ),
    currentTaskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const updates: {
      status: typeof args.status;
      updatedAt: number;
      lastActiveAt: number;
      startedAt?: number;
      currentTaskId?: typeof args.currentTaskId;
    } = {
      status: args.status,
      updatedAt: now,
      lastActiveAt: now,
    };
    
    if (args.status === "active") {
      updates.startedAt = now;
    }
    
    if (args.currentTaskId !== undefined) {
      updates.currentTaskId = args.currentTaskId;
    }
    
    await ctx.db.patch(args.id, updates);
  },
});

/**
 * Delete an agent
 */
export const remove = mutation({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

/**
 * Update agent status from Gateway presence/heartbeat events.
 */
export const updateStatusFromEvent = internalMutation({
  args: eventValidator,
  handler: async (ctx, event): Promise<void> => {
    const now = Date.now();
    const eventTime = normalizeTimestamp(event.timestamp, now);

    if (event.eventType === "presence") {
      const parsed = presencePayloadSchema.safeParse(event.payload);
      if (parsed.success && parsed.data.entries && parsed.data.entries.length > 0) {
        await Promise.all(
          parsed.data.entries.map((entry) =>
            upsertStatus(
              ctx,
              {
                agentId: entry.deviceId,
                status: "online",
                lastHeartbeat: normalizeTimestamp(entry.lastSeen, eventTime),
                lastActivity: normalizeTimestamp(entry.lastSeen, eventTime),
                currentSession: event.sessionKey,
                sessionInfo: entry,
              },
              { preservePaused: true, preserveBusy: true }
            )
          )
        );
        return;
      }
    }

    if (event.eventType === "heartbeat" || event.eventType === "presence") {
      await upsertStatus(
        ctx,
        {
          agentId: event.agentId,
          status: "online",
          lastHeartbeat: eventTime,
          lastActivity: eventTime,
          currentSession: event.sessionKey,
        },
        { preservePaused: true, preserveBusy: true }
      );
    }
  },
});

/**
 * Update an agent's bridgeAgentId mapping.
 */
export const setBridgeAgentId = mutation({
  args: {
    id: v.id("agents"),
    bridgeAgentId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.id, {
      bridgeAgentId: args.bridgeAgentId,
      updatedAt: Date.now(),
    });
  },
});
