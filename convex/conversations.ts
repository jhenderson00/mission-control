import { v } from "convex/values";
import { z } from "zod";
import { internalMutation } from "./_generated/server";

const eventValidator = v.object({
  eventId: v.string(),
  eventType: v.string(),
  agentId: v.string(),
  sessionKey: v.optional(v.string()),
  timestamp: v.string(),
  sequence: v.number(),
  payload: v.any(),
});

const agentPayloadSchema = z
  .object({
    runId: z.string(),
    sessionKey: z.string(),
    status: z.enum(["started", "streaming", "done", "error"]),
    delta: z
      .object({
        type: z.enum(["text", "tool_call", "tool_result"]),
        content: z.string().optional(),
        toolName: z.string().optional(),
        toolInput: z.unknown().optional(),
        toolOutput: z.unknown().optional(),
      })
      .optional(),
    summary: z
      .object({
        inputTokens: z.number(),
        outputTokens: z.number(),
        durationMs: z.number(),
      })
      .optional(),
  })
  .passthrough();

const chatMessageSchema = z
  .object({
    sessionKey: z.string().optional(),
    agentId: z.string().optional(),
    role: z.enum(["user", "assistant", "system"]).optional(),
    content: z.string(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    sequence: z.number().optional(),
  })
  .passthrough();

const chatPayloadSchema = z.union([
  chatMessageSchema,
  z.array(chatMessageSchema),
  z.object({ messages: z.array(chatMessageSchema) }),
]);

type Role = "user" | "assistant" | "system";

function normalizeRole(role: string | undefined): Role {
  if (role === "user" || role === "assistant" || role === "system") {
    return role;
  }
  return "assistant";
}

function normalizeTimestamp(value: string | number | undefined, fallback: number): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

type IndexQuery = {
  eq: (field: "sessionKey" | "sequence", value: string | number) => IndexQuery;
};

async function upsertMessage(
  ctx: {
    db: {
      query: (tableName: "messages") => {
        withIndex: (
          index: "by_session",
          builder: (q: IndexQuery) => unknown
        ) => { take: (count: number) => Promise<Array<{ _id: string }>> };
      };
      patch: (id: string, updates: Record<string, unknown>) => Promise<void>;
      insert: (tableName: "messages", value: Record<string, unknown>) => Promise<string>;
    };
  },
  message: {
    sessionKey: string;
    agentId: string;
    role: Role;
    content: string;
    isStreaming: boolean;
    timestamp: number;
    sequence: number;
  }
): Promise<string> {
  const existing = await ctx.db
    .query("messages")
    .withIndex("by_session", (q) =>
      q.eq("sessionKey", message.sessionKey).eq("sequence", message.sequence)
    )
    .take(1);

  if (existing.length > 0) {
    await ctx.db.patch(existing[0]._id, {
      content: message.content,
      isStreaming: message.isStreaming,
      timestamp: message.timestamp,
      role: message.role,
    });
    return existing[0]._id;
  }

  return await ctx.db.insert("messages", message);
}

/**
 * Process streaming agent events into messages.
 */
export const processAgentEvent = internalMutation({
  args: eventValidator,
  handler: async (ctx, event): Promise<string | null> => {
    const parsed = agentPayloadSchema.safeParse(event.payload);
    if (!parsed.success) {
      return null;
    }

    const payload = parsed.data;
    const sessionKey = event.sessionKey ?? payload.sessionKey;
    const delta = payload.delta;
    if (!sessionKey || !delta) {
      return null;
    }

    let content: string | null = null;
    if (delta.type === "text") {
      content = delta.content ?? null;
    } else {
      content = JSON.stringify({
        type: delta.type,
        toolName: delta.toolName,
        toolInput: delta.toolInput,
        toolOutput: delta.toolOutput,
      });
    }

    if (!content) {
      return null;
    }

    const timestamp = normalizeTimestamp(event.timestamp, Date.now());
    const isStreaming = payload.status === "streaming";

    return await upsertMessage(ctx, {
      sessionKey,
      agentId: event.agentId,
      role: "assistant",
      content,
      isStreaming,
      timestamp,
      sequence: event.sequence,
    });
  },
});

/**
 * Process chat/history events into messages.
 */
export const processChatEvent = internalMutation({
  args: eventValidator,
  handler: async (ctx, event): Promise<Array<string>> => {
    const parsed = chatPayloadSchema.safeParse(event.payload);
    if (!parsed.success) {
      return [];
    }

    const payload = parsed.data;
    const messages = Array.isArray(payload)
      ? payload
      : "messages" in payload
        ? payload.messages
        : [payload];

    const inserted: string[] = [];
    const baseSequence = event.sequence;
    const eventTimestamp = normalizeTimestamp(event.timestamp, Date.now());

    for (const [index, message] of messages.entries()) {
      const sessionKey = message.sessionKey ?? event.sessionKey;
      const agentId = message.agentId ?? event.agentId;
      if (!sessionKey || !agentId) {
        continue;
      }

      const sequence = message.sequence ?? baseSequence + index;
      const timestamp = normalizeTimestamp(message.timestamp, eventTimestamp);
      const id = await upsertMessage(ctx, {
        sessionKey,
        agentId,
        role: normalizeRole(message.role),
        content: message.content,
        isStreaming: false,
        timestamp,
        sequence,
      });

      inserted.push(id);
    }

    return inserted;
  },
});
