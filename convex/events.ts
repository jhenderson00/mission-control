import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Get events for an agent (conversation stream)
 */
export const listByAgent = query({
  args: {
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("events")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_agent", (q: any) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Get events for a task
 */
export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("events")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_task", (q: any) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Get recent events (for global activity feed)
 */
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
    type: v.optional(v.union(
      v.literal("message"),
      v.literal("tool_call"),
      v.literal("tool_result"),
      v.literal("decision"),
      v.literal("error"),
      v.literal("status_change"),
      v.literal("spawn"),
      v.literal("complete")
    )),
  },
  handler: async (ctx, args) => {
    if (args.type) {
      return await ctx.db
        .query("events")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_type", (q: any) => q.eq("type", args.type!))
        .order("desc")
        .take(args.limit ?? 50);
    }
    
    return await ctx.db
      .query("events")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

/**
 * Get event counts by type (for metrics)
 */
export const countsByType = query({
  args: {
    since: v.optional(v.number()), // timestamp
  },
  handler: async (ctx, args) => {
    const events = await ctx.db.query("events").collect();
    
    const filtered = args.since
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? events.filter((e: any) => e.createdAt >= args.since!)
      : events;
    
    const counts: Record<string, number> = {
      message: 0,
      tool_call: 0,
      tool_result: 0,
      decision: 0,
      error: 0,
      status_change: 0,
      spawn: 0,
      complete: 0,
    };
    
    for (const event of filtered) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const type = (event as any).type;
      if (type in counts) {
        counts[type]++;
      }
    }
    
    return counts;
  },
});

/**
 * Log a new event
 */
export const log = mutation({
  args: {
    agentId: v.id("agents"),
    taskId: v.optional(v.id("tasks")),
    type: v.union(
      v.literal("message"),
      v.literal("tool_call"),
      v.literal("tool_result"),
      v.literal("decision"),
      v.literal("error"),
      v.literal("status_change"),
      v.literal("spawn"),
      v.literal("complete")
    ),
    role: v.optional(v.union(
      v.literal("system"),
      v.literal("user"),
      v.literal("assistant")
    )),
    content: v.string(),
    metadata: v.optional(v.object({
      tokens: v.optional(v.number()),
      latencyMs: v.optional(v.number()),
      model: v.optional(v.string()),
      toolName: v.optional(v.string()),
      exitCode: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("events", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
