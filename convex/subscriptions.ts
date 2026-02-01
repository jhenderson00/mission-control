import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseWriter } from "./_generated/server";
import { mutation, query } from "./_generated/server";

export type SubscriberType = "user" | "agent";

export type SubscriptionTarget = {
  taskId: Id<"tasks">;
  subscriberType: SubscriberType;
  subscriberId: string;
};

export type SubscriptionResult = {
  id: Id<"taskSubscriptions">;
  existing: boolean;
};

export async function ensureSubscription(
  ctx: { db: DatabaseWriter },
  target: SubscriptionTarget
): Promise<SubscriptionResult> {
  const subscriberId = target.subscriberId.trim();
  const existing = await ctx.db
    .query("taskSubscriptions")
    .withIndex("by_task_subscriber", (q) =>
      q
        .eq("taskId", target.taskId)
        .eq("subscriberType", target.subscriberType)
        .eq("subscriberId", subscriberId)
    )
    .take(1);

  if (existing.length > 0) {
    return { id: existing[0]._id, existing: true };
  }

  const id = await ctx.db.insert("taskSubscriptions", {
    taskId: target.taskId,
    subscriberType: target.subscriberType,
    subscriberId,
    createdAt: Date.now(),
  });

  return { id, existing: false };
}

export const subscribe = mutation({
  args: {
    taskId: v.id("tasks"),
    subscriberType: v.union(v.literal("user"), v.literal("agent")),
    subscriberId: v.string(),
  },
  handler: async (ctx, args): Promise<SubscriptionResult> => {
    return await ensureSubscription(ctx, {
      taskId: args.taskId,
      subscriberType: args.subscriberType,
      subscriberId: args.subscriberId,
    });
  },
});

export const unsubscribe = mutation({
  args: {
    taskId: v.id("tasks"),
    subscriberType: v.union(v.literal("user"), v.literal("agent")),
    subscriberId: v.string(),
  },
  handler: async (ctx, args): Promise<{ removed: boolean }> => {
    const existing = await ctx.db
      .query("taskSubscriptions")
      .withIndex("by_task_subscriber", (q) =>
        q
          .eq("taskId", args.taskId)
          .eq("subscriberType", args.subscriberType)
          .eq("subscriberId", args.subscriberId.trim())
      )
      .take(1);

    if (existing.length === 0) {
      return { removed: false };
    }

    await ctx.db.delete(existing[0]._id);
    return { removed: true };
  },
});

export const listSubscribers = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args): Promise<Array<Doc<"taskSubscriptions">>> => {
    return await ctx.db
      .query("taskSubscriptions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();
  },
});

export const getSubscribers = query({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args): Promise<Array<Doc<"taskSubscriptions">>> => {
    return await ctx.db
      .query("taskSubscriptions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();
  },
});

export const isSubscribed = query({
  args: {
    taskId: v.id("tasks"),
    subscriberType: v.union(v.literal("user"), v.literal("agent")),
    subscriberId: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const existing = await ctx.db
      .query("taskSubscriptions")
      .withIndex("by_task_subscriber", (q) =>
        q
          .eq("taskId", args.taskId)
          .eq("subscriberType", args.subscriberType)
          .eq("subscriberId", args.subscriberId.trim())
      )
      .take(1);
    return existing.length > 0;
  },
});
