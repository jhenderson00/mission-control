import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

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
