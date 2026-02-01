import { v } from "convex/values";
import { z } from "zod";
import type { Doc, Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { httpAction, mutation, query } from "./_generated/server";

const recipientTypeValidator = v.union(v.literal("user"), v.literal("agent"));

const pendingRequestSchema = z
  .object({
    limit: z.number().int().positive().max(200).optional(),
    recipientType: z.enum(["user", "agent"]).optional(),
  })
  .strict();

const markDeliveredSchema = z
  .object({
    notificationId: z.string(),
    deliveredAt: z.number().int().optional(),
  })
  .strict();

const recordAttemptSchema = z
  .object({
    notificationId: z.string(),
    error: z.string().optional(),
  })
  .strict();

function resolveNotificationSecret(): string | null {
  return (
    process.env.NOTIFICATION_DAEMON_SECRET ??
    process.env.BRIDGE_SECRET ??
    null
  );
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  if (!limit || !Number.isFinite(limit) || limit <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(limit), 200);
}

/**
 * List pending notifications for polling daemon.
 */
export const listPending = query({
  args: {
    limit: v.optional(v.number()),
    recipientType: v.optional(recipientTypeValidator),
  },
  handler: async (ctx, args): Promise<Array<Doc<"notifications">>> => {
    const limit = normalizeLimit(args.limit, 50);
    if (args.recipientType) {
      return await ctx.db
        .query("notifications")
        .withIndex("by_status_recipient", (q) =>
          q.eq("status", "pending").eq("recipientType", args.recipientType)
        )
        .order("asc")
        .take(limit);
    }

    return await ctx.db
      .query("notifications")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(limit);
  },
});

/**
 * Mark a notification as delivered.
 */
export const markDelivered = mutation({
  args: {
    notificationId: v.id("notifications"),
    deliveredAt: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<Doc<"notifications"> | null> => {
    const existing = await ctx.db.get(args.notificationId);
    if (!existing) {
      return null;
    }
    if (existing.status === "delivered") {
      return existing;
    }

    const deliveredAt = args.deliveredAt ?? Date.now();
    await ctx.db.patch(existing._id, {
      status: "delivered",
      deliveredAt,
      lastError: undefined,
    });

    return await ctx.db.get(existing._id);
  },
});

/**
 * Record a delivery attempt for retry/backoff tracking.
 */
export const recordAttempt = mutation({
  args: {
    notificationId: v.id("notifications"),
    error: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<Doc<"notifications"> | null> => {
    const existing = await ctx.db.get(args.notificationId);
    if (!existing) {
      return null;
    }
    if (existing.status === "delivered") {
      return existing;
    }

    const nextError = args.error?.slice(0, 500);
    await ctx.db.patch(existing._id, {
      attempts: existing.attempts + 1,
      lastAttemptAt: Date.now(),
      lastError: nextError ?? existing.lastError,
    });

    return await ctx.db.get(existing._id);
  },
});

/**
 * HTTP endpoint for notification polling.
 */
export const listPendingHttp = httpAction(
  async (ctx, request): Promise<Response> => {
    const expectedSecret = resolveNotificationSecret();
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
      body = {};
    }

    const parsed = pendingRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return new Response("invalid payload", { status: 400 });
    }

    const notifications = await ctx.runQuery(api.notifications.listPending, {
      limit: parsed.data.limit,
      recipientType: parsed.data.recipientType,
    });

    return new Response(JSON.stringify(notifications), {
      headers: { "content-type": "application/json" },
    });
  }
);

/**
 * HTTP endpoint to mark notification delivered.
 */
export const markDeliveredHttp = httpAction(
  async (ctx, request): Promise<Response> => {
    const expectedSecret = resolveNotificationSecret();
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

    const parsed = markDeliveredSchema.safeParse(body);
    if (!parsed.success) {
      return new Response("invalid payload", { status: 400 });
    }

    try {
      await ctx.runMutation(api.notifications.markDelivered, {
        notificationId: parsed.data.notificationId as Id<"notifications">,
        deliveredAt: parsed.data.deliveredAt,
      });
    } catch {
      return new Response("notification not found", { status: 404 });
    }

    return new Response("ok");
  }
);

/**
 * HTTP endpoint to record notification attempt failures.
 */
export const recordAttemptHttp = httpAction(
  async (ctx, request): Promise<Response> => {
    const expectedSecret = resolveNotificationSecret();
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

    const parsed = recordAttemptSchema.safeParse(body);
    if (!parsed.success) {
      return new Response("invalid payload", { status: 400 });
    }

    try {
      await ctx.runMutation(api.notifications.recordAttempt, {
        notificationId: parsed.data.notificationId as Id<"notifications">,
        error: parsed.data.error,
      });
    } catch {
      return new Response("notification not found", { status: 404 });
    }

    return new Response("ok");
  }
);
