import { v } from "convex/values";
import { z } from "zod";
import { httpAction, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

const eventValidator = v.object({
  eventId: v.string(),
  eventType: v.string(),
  agentId: v.string(),
  sessionKey: v.optional(v.string()),
  timestamp: v.string(),
  sequence: v.number(),
  payload: v.any(),
});

const eventSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  agentId: z.string(),
  sessionKey: z.string().optional(),
  timestamp: z.string(),
  sequence: z.number(),
  payload: z.unknown(),
});

const eventBatchSchema = z.union([eventSchema, z.array(eventSchema)]);

const eventTypes = ["agent", "chat", "presence", "health", "heartbeat"] as const;

type NormalizedEvent = {
  _id: string;
  createdAt: number;
  type: string;
  content: string;
};

function normalizeTimestamp(value: string, fallback: number): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function summarizePayload(eventType: string, payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.content === "string") {
      return record.content;
    }
    if (record.delta && typeof record.delta === "object") {
      const delta = record.delta as Record<string, unknown>;
      if (typeof delta.content === "string") {
        return delta.content;
      }
    }
    if (typeof record.status === "string") {
      return record.status;
    }
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return eventType;
  }
}

function normalizeEvent(event: {
  _id: string;
  receivedAt: number;
  timestamp: string;
  eventType: string;
  payload: unknown;
}): NormalizedEvent {
  const createdAt = normalizeTimestamp(event.timestamp, event.receivedAt);
  return {
    _id: event._id,
    createdAt,
    type: event.eventType,
    content: summarizePayload(event.eventType, event.payload),
  };
}

/**
 * HTTP ingest endpoint for Gateway events (Bridge -> Convex)
 */
export const ingest = httpAction(async (ctx, request): Promise<Response> => {
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

  const parsed = eventBatchSchema.safeParse(body);
  if (!parsed.success) {
    return new Response("invalid event payload", { status: 400 });
  }

  const events = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

  for (const event of events) {
    await ctx.runMutation(internal.events.store, event);
    switch (event.eventType) {
      case "agent":
        await ctx.runMutation(internal.conversations.processAgentEvent, event);
        break;
      case "chat":
        await ctx.runMutation(internal.conversations.processChatEvent, event);
        break;
      case "presence":
      case "heartbeat":
        await ctx.runMutation(internal.agents.updateStatusFromEvent, event);
        break;
      default:
        break;
    }
  }

  return new Response("ok");
});

/**
 * Store a raw Gateway event (idempotent by eventId).
 */
export const store = internalMutation({
  args: eventValidator,
  handler: async (ctx, args): Promise<string> => {
    const existing = await ctx.db
      .query("events")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .take(1);

    if (existing.length > 0) {
      return existing[0]._id;
    }

    return await ctx.db.insert("events", {
      ...args,
      receivedAt: Date.now(),
    });
  },
});

/**
 * Get events for an agent (activity feed).
 */
export const listByAgent = query({
  args: {
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<NormalizedEvent[]> => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 100);

    return events.map((event) =>
      normalizeEvent({
        _id: event._id,
        receivedAt: event.receivedAt,
        timestamp: event.timestamp,
        eventType: event.eventType,
        payload: event.payload,
      })
    );
  },
});

/**
 * Get recent events (for global activity feed).
 */
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<NormalizedEvent[]> => {
    if (args.type) {
      const eventType = args.type;
      const events = await ctx.db
        .query("events")
        .withIndex("by_type", (q) => q.eq("eventType", eventType))
        .order("desc")
        .take(args.limit ?? 50);

      return events.map((event) =>
        normalizeEvent({
          _id: event._id,
          receivedAt: event.receivedAt,
          timestamp: event.timestamp,
          eventType: event.eventType,
          payload: event.payload,
        })
      );
    }

    const events = await ctx.db
      .query("events")
      .order("desc")
      .take(args.limit ?? 50);

    return events.map((event) =>
      normalizeEvent({
        _id: event._id,
        receivedAt: event.receivedAt,
        timestamp: event.timestamp,
        eventType: event.eventType,
        payload: event.payload,
      })
    );
  },
});

/**
 * Get event counts by type (for metrics).
 */
export const countsByType = query({
  args: {
    since: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<(typeof eventTypes)[number], number>> => {
    const since = args.since;
    const entries = await Promise.all(
      eventTypes.map(async (type) => {
        const events = await ctx.db
          .query("events")
          .withIndex("by_type", (q) => q.eq("eventType", type))
          .collect();
        const total = since
          ? events.filter((event) => event.receivedAt >= since).length
          : events.length;
        return [type, total] as const;
      })
    );

    return Object.fromEntries(entries) as Record<(typeof eventTypes)[number], number>;
  },
});
