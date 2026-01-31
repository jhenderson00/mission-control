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
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
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
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
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
        .withIndex("by_type", (q) => q.eq("type", args.type))
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
    const types = [
      "message",
      "tool_call",
      "tool_result",
      "decision",
      "error",
      "status_change",
      "spawn",
      "complete",
    ] as const;
    const since = args.since;

    const entries = await Promise.all(
      types.map(async (type) => {
        const query = ctx.db
          .query("events")
          .withIndex("by_type", (q) => q.eq("type", type));

        const events = await query.collect();
        const total = since
          ? events.filter((event) => event.createdAt >= since).length
          : events.length;
        return [type, total] as const;
      })
    );

    return Object.fromEntries(entries) as Record<(typeof types)[number], number>;
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
