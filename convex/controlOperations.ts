import { v } from "convex/values";
import { query } from "./_generated/server";

const activeStatuses = ["queued", "sent", "acked"] as const;

/**
 * Get active control operations for a single agent.
 */
export const activeByAgent = query({
  args: {
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const baseQuery = ctx.db
      .query("agentControlOperations")
      .withIndex("by_agent", (q) => q.eq("agentIds", [args.agentId]))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), activeStatuses[0]),
          q.eq(q.field("status"), activeStatuses[1]),
          q.eq(q.field("status"), activeStatuses[2])
        )
      )
      .order("desc");

    return await baseQuery.take(args.limit ?? 50);
  },
});

/**
 * Get recent control operations for a specific operator.
 */
export const recentByOperator = query({
  args: {
    requestedBy: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const baseQuery = ctx.db
      .query("agentControlOperations")
      .withIndex("by_operator", (q) => q.eq("requestedBy", args.requestedBy))
      .order("desc");

    return await baseQuery.take(args.limit ?? 50);
  },
});
