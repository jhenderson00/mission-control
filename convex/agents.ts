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
