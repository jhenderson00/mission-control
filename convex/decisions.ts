import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Get decisions for an agent
 */
export const listByAgent = query({
  args: {
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("decisions")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

/**
 * Get decisions for a task
 */
export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("decisions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

/**
 * Get recent decisions (for dashboard)
 */
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
    outcome: v.optional(v.union(
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("pending")
    )),
  },
  handler: async (ctx, args) => {
    if (args.outcome) {
      return await ctx.db
        .query("decisions")
        .withIndex("by_outcome", (q) => q.eq("outcome", args.outcome))
        .order("desc")
        .take(args.limit ?? 50);
    }
    
    return await ctx.db
      .query("decisions")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

/**
 * Get a decision with its chain (parent decisions)
 */
export const getWithChain = query({
  args: { id: v.id("decisions") },
  handler: async (ctx, args) => {
    const decision = await ctx.db.get(args.id);
    if (!decision) return null;
    
    const chain = [decision];
    let current = decision;
    
    // Walk up the chain
    while (current.parentDecisionId) {
      const parent = await ctx.db.get(current.parentDecisionId);
      if (!parent) break;
      chain.unshift(parent);
      current = parent;
    }
    
    return { decision, chain };
  },
});

/**
 * Get pending decisions count
 */
export const pendingCount = query({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("decisions")
      .withIndex("by_outcome", (q) => q.eq("outcome", "pending"))
      .collect();
    return pending.length;
  },
});

/**
 * Record a new decision
 */
export const record = mutation({
  args: {
    agentId: v.id("agents"),
    taskId: v.optional(v.id("tasks")),
    decision: v.string(),
    reasoning: v.string(),
    confidence: v.optional(v.number()),
    alternativesConsidered: v.optional(v.array(v.object({
      option: v.string(),
      rejectedBecause: v.string(),
    }))),
    contextRefs: v.optional(v.array(v.object({
      type: v.union(
        v.literal("file"),
        v.literal("message"),
        v.literal("decision"),
        v.literal("external")
      ),
      id: v.string(),
      summary: v.optional(v.string()),
      relevance: v.optional(v.string()),
    }))),
    parentDecisionId: v.optional(v.id("decisions")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("decisions", {
      ...args,
      outcome: "pending",
      createdAt: Date.now(),
    });
  },
});

/**
 * Update decision outcome
 */
export const resolve = mutation({
  args: {
    id: v.id("decisions"),
    outcome: v.union(
      v.literal("accepted"),
      v.literal("rejected")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      outcome: args.outcome,
      decidedAt: Date.now(),
    });
  },
});
