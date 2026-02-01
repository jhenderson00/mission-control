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
  agentId: string;
  createdAt: number;
  type: string;
  content: string;
};

function normalizeTimestamp(value: string, fallback: number): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function summarizePayload(eventType: string, payload: unknown): string {
  // Handle string payloads
  if (typeof payload === "string") {
    // Try to parse stringified JSON content
    try {
      const parsed = JSON.parse(payload);
      if (parsed && typeof parsed === "object") {
        return summarizePayload(eventType, parsed);
      }
    } catch {
      // Not JSON, return as-is
    }
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return eventType;
  }

  const record = payload as Record<string, unknown>;

  // Handle specific event types with human-readable summaries
  switch (eventType) {
    case "health": {
      const agents = record.agents as Array<{ agentId?: string }> | undefined;
      const ok = record.ok;
      if (agents?.length) {
        const agentIds = agents.map((a) => a.agentId || "unknown").join(", ");
        return `Gateway ${ok ? "healthy" : "unhealthy"}: ${agents.length} agent(s) [${agentIds}]`;
      }
      return `Gateway health check: ${ok ? "OK" : "ERROR"}`;
    }
    case "presence": {
      const presence = record.presence as Array<{ host?: string; mode?: string; reason?: string }> | undefined;
      if (presence?.length) {
        const connected = presence.filter((p) => p.reason === "connect").length;
        const disconnected = presence.filter((p) => p.reason === "disconnect").length;
        return `Presence update: ${connected} connected, ${disconnected} disconnected`;
      }
      return "Presence update";
    }
    case "connect.challenge":
      return "Authentication challenge";
    case "connect.auth":
      return "Authentication response";
    case "connect.welcome":
      return "Connection established";
    case "session.start":
      return `Session started: ${record.sessionKey || "unknown"}`;
    case "session.end":
      return `Session ended: ${record.sessionKey || "unknown"}`;
  }

  // Try to extract text content from nested structures
  if (record.data && typeof record.data === "object") {
    const data = record.data as Record<string, unknown>;
    if (typeof data.text === "string") return data.text;
    if (typeof data.delta === "string") return data.delta;
  }

  if (typeof record.content === "string") {
    // Try to parse stringified JSON content
    try {
      const parsed = JSON.parse(record.content);
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        if (obj.data && typeof obj.data === "object") {
          const data = obj.data as Record<string, unknown>;
          if (typeof data.text === "string") return data.text;
          if (typeof data.delta === "string") return data.delta;
        }
      }
    } catch {
      // Not JSON, return as-is
    }
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

  if (typeof record.message === "string") {
    return record.message;
  }

  if (typeof record.text === "string") {
    return record.text;
  }

  // Fallback: return event type rather than raw JSON dump
  return eventType;
}

function normalizeEvent(event: {
  _id: string;
  receivedAt: number;
  timestamp: string;
  agentId: string;
  eventType: string;
  payload: unknown;
}): NormalizedEvent {
  const createdAt = normalizeTimestamp(event.timestamp, event.receivedAt);
  return {
    _id: event._id,
    agentId: event.agentId,
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
        agentId: event.agentId,
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
          agentId: event.agentId,
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
        agentId: event.agentId,
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
