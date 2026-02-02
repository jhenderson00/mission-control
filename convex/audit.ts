import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";
import { normalizeAgentIdForLookup, resolveAgentLookup } from "./agentLinking";

const outcomeValidator = v.union(
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("error")
);

export const recordControlAudit = internalMutation({
  args: {
    action: v.string(),
    operationId: v.string(),
    requestId: v.string(),
    bulkId: v.optional(v.string()),
    agentId: v.string(),
    command: v.string(),
    params: v.optional(v.any()),
    outcome: outcomeValidator,
    requestedBy: v.string(),
    requestedAt: v.number(),
    ackedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"auditLog">> => {
    return await ctx.db.insert("auditLog", {
      action: args.action,
      operationId: args.operationId,
      requestId: args.requestId,
      bulkId: args.bulkId,
      agentId: args.agentId,
      command: args.command,
      params: args.params,
      outcome: args.outcome,
      requestedBy: args.requestedBy,
      requestedAt: args.requestedAt,
      ackedAt: args.ackedAt,
      completedAt: args.completedAt,
      error: args.error,
    });
  },
});

export const listByAgent = query({
  args: {
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<Doc<"auditLog">>> => {
    const normalized = normalizeAgentIdForLookup(args.agentId);
    if (!normalized) {
      return [];
    }
    const lookup = await resolveAgentLookup(ctx, normalized);
    const lookupIds = lookup?.lookupIds ?? [normalized];
    const results = await Promise.all(
      lookupIds.map((lookupId) =>
        ctx.db
          .query("auditLog")
          .withIndex("by_agent", (q) => q.eq("agentId", lookupId))
          .order("desc")
          .take(args.limit ?? 50)
      )
    );
    const merged = new Map<string, Doc<"auditLog">>();
    for (const record of results.flat()) {
      merged.set(record._id, record);
    }
    const sorted = Array.from(merged.values()).sort(
      (a, b) => b.requestedAt - a.requestedAt
    );
    return sorted.slice(0, args.limit ?? 50);
  },
});

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
    requestedBy: v.optional(v.string()),
    action: v.optional(v.string()),
    outcome: v.optional(outcomeValidator),
  },
  handler: async (ctx, args): Promise<Array<Doc<"auditLog">>> => {
    const baseQuery = args.requestedBy
      ? ctx.db
          .query("auditLog")
          .withIndex("by_requested_by", (q) =>
            q.eq("requestedBy", args.requestedBy as string)
          )
      : args.action
        ? ctx.db
            .query("auditLog")
            .withIndex("by_action", (q) => q.eq("action", args.action as string))
        : ctx.db.query("auditLog");

    const filtered = args.outcome
      ? baseQuery.filter((q) => q.eq(q.field("outcome"), args.outcome))
      : baseQuery;

    return await filtered.order("desc").take(args.limit ?? 50);
  },
});
