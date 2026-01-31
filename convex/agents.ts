import { v } from "convex/values";
import { z } from "zod";
import { query, mutation, internalMutation } from "./_generated/server";

const eventValidator = v.object({
  eventId: v.string(),
  eventType: v.string(),
  agentId: v.string(),
  sessionKey: v.optional(v.string()),
  timestamp: v.string(),
  sequence: v.number(),
  payload: v.any(),
});

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

function normalizeTimestamp(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

async function upsertStatus(
  ctx: {
    db: {
      query: (tableName: "agentStatus") => {
        withIndex: (
          index: "by_agent",
          builder: (q: { eq: (field: "agentId", value: string) => unknown }) => unknown
        ) => { take: (count: number) => Promise<Array<{ _id: string }>> };
      };
      patch: (id: string, updates: Record<string, unknown>) => Promise<void>;
      insert: (tableName: "agentStatus", value: Record<string, unknown>) => Promise<string>;
    };
  },
  status: {
    agentId: string;
    lastHeartbeat: number;
    lastActivity: number;
    currentSession?: string;
    status: "online" | "degraded" | "offline";
  }
): Promise<string> {
  const existing = await ctx.db
    .query("agentStatus")
    .withIndex("by_agent", (q) => q.eq("agentId", status.agentId))
    .take(1);

  if (existing.length > 0) {
    await ctx.db.patch(existing[0]._id, status);
    return existing[0]._id;
  }

  return await ctx.db.insert("agentStatus", status);
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
      return await ctx.db
        .query("agents")
        .withIndex("by_status", (q) => q.eq("status", args.status))
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
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
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
            upsertStatus(ctx, {
              agentId: entry.deviceId,
              status: "online",
              lastHeartbeat: normalizeTimestamp(entry.lastSeen, eventTime),
              lastActivity: normalizeTimestamp(entry.lastSeen, eventTime),
              currentSession: event.sessionKey,
            })
          )
        );
        return;
      }
    }

    if (event.eventType === "heartbeat" || event.eventType === "presence") {
      await upsertStatus(ctx, {
        agentId: event.agentId,
        status: "online",
        lastHeartbeat: eventTime,
        lastActivity: eventTime,
        currentSession: event.sessionKey,
      });
    }
  },
});
