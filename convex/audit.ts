import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";
import { normalizeAgentIdForLookup, resolveAgentLookup } from "./agentLinking";

const outcomeValidator = v.union(
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("error"),
  v.literal("timed-out"),
  v.literal("completed")
);

const auditEntryValidator = v.object({
  timestamp: v.optional(v.number()),
  operatorId: v.string(),
  operatorEmail: v.optional(v.string()),
  action: v.string(),
  targetAgentId: v.string(),
  parameters: v.optional(v.any()),
  outcome: outcomeValidator,
  sourceIp: v.optional(v.string()),
  sessionId: v.optional(v.string()),
  correlationId: v.string(),
  command: v.optional(v.string()),
  requestId: v.optional(v.string()),
  operationId: v.optional(v.string()),
  bulkId: v.optional(v.string()),
  error: v.optional(v.string()),
  requestedAt: v.optional(v.number()),
  ackedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
});

const resolveTimestamp = (entry: {
  timestamp?: number;
  ackedAt?: number;
  requestedAt?: number;
}): number => entry.timestamp ?? entry.ackedAt ?? entry.requestedAt ?? Date.now();

export const recordControlAction = internalMutation({
  args: auditEntryValidator,
  handler: async (ctx, args): Promise<Id<"auditLogs">> => {
    const timestamp = resolveTimestamp(args);
    return await ctx.db.insert("auditLogs", {
      ...args,
      timestamp,
    });
  },
});

export const recordBulkAction = internalMutation({
  args: {
    entries: v.array(auditEntryValidator),
  },
  handler: async (ctx, args): Promise<Array<Id<"auditLogs">>> => {
    const ids: Array<Id<"auditLogs">> = [];
    for (const entry of args.entries) {
      const timestamp = resolveTimestamp(entry);
      ids.push(
        await ctx.db.insert("auditLogs", {
          ...entry,
          timestamp,
        })
      );
    }
    return ids;
  },
});

export const listByAgent = query({
  args: {
    agentId: v.string(),
    timeRange: v.optional(
      v.object({
        start: v.optional(v.number()),
        end: v.optional(v.number()),
      })
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<Doc<"auditLogs">>> => {
    const normalized = normalizeAgentIdForLookup(args.agentId);
    if (!normalized) {
      return [];
    }
    const lookup = await resolveAgentLookup(ctx, normalized);
    const lookupIds = lookup?.lookupIds ?? [normalized];
    const limit = args.limit ?? 50;
    const results = await Promise.all(
      lookupIds.map((lookupId) =>
        ctx.db
          .query("auditLogs")
          .withIndex("by_target_agent", (q) => q.eq("targetAgentId", lookupId))
          .order("desc")
          .take(limit)
      )
    );
    const merged = new Map<string, Doc<"auditLogs">>();
    for (const record of results.flat()) {
      merged.set(record._id, record);
    }
    const sorted = Array.from(merged.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
    const filtered = args.timeRange
      ? sorted.filter((record) => {
          const { start, end } = args.timeRange ?? {};
          if (typeof start === "number" && record.timestamp < start) {
            return false;
          }
          if (typeof end === "number" && record.timestamp > end) {
            return false;
          }
          return true;
        })
      : sorted;
    return filtered.slice(0, limit);
  },
});

export const listByOperator = query({
  args: {
    operatorId: v.string(),
    timeRange: v.optional(
      v.object({
        start: v.optional(v.number()),
        end: v.optional(v.number()),
      })
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<Doc<"auditLogs">>> => {
    const limit = args.limit ?? 50;
    const records = await ctx.db
      .query("auditLogs")
      .withIndex("by_operator", (q) => q.eq("operatorId", args.operatorId))
      .order("desc")
      .take(limit);

    const filtered = args.timeRange
      ? records.filter((record) => {
          const { start, end } = args.timeRange ?? {};
          if (typeof start === "number" && record.timestamp < start) {
            return false;
          }
          if (typeof end === "number" && record.timestamp > end) {
            return false;
          }
          return true;
        })
      : records;

    return filtered.slice(0, limit);
  },
});

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<Doc<"auditLogs">>> => {
    return await ctx.db.query("auditLogs").order("desc").take(args.limit ?? 50);
  },
});

export const getByCorrelation = query({
  args: {
    correlationId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<Doc<"auditLogs">>> => {
    return await ctx.db
      .query("auditLogs")
      .withIndex("by_correlation", (q) => q.eq("correlationId", args.correlationId))
      .order("desc")
      .take(args.limit ?? 200);
  },
});
