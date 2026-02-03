import { v } from "convex/values";
import { z } from "zod";
import { httpAction, internalMutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  normalizeAgentIdForLookup,
  resolveAgentLookup,
  resolveBridgeAgentId,
  resolveOrCreateAgentRecord,
} from "./agentLinking";

const eventValidator = v.object({
  eventId: v.string(),
  eventType: v.string(),
  agentId: v.string(),
  sessionKey: v.optional(v.string()),
  timestamp: v.string(),
  receivedAt: v.optional(v.number()),
  sequence: v.number(),
  payload: v.any(),
  sourceEventId: v.optional(v.string()),
  sourceEventType: v.optional(v.string()),
  runId: v.optional(v.string()),
});

const eventSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  agentId: z.string().trim().min(1),
  sessionKey: z.string().optional(),
  timestamp: z.string(),
  sequence: z.number(),
  payload: z.unknown(),
  sourceEventId: z.string().optional(),
  sourceEventType: z.string().optional(),
  runId: z.string().optional(),
});

const eventBatchSchema = z.union([eventSchema, z.array(eventSchema)]);

const eventTypes = [
  "agent",
  "chat",
  "presence",
  "health",
  "heartbeat",
  "tool_call",
  "tool_result",
  "thinking",
  "error",
  "token_usage",
  "session_start",
  "session_end",
  "memory_operation",
] as const;

type NormalizedEvent = {
  _id: string;
  agentId: string;
  createdAt: number;
  receivedAt: number;
  type: string;
  content: string;
};

type DiagnosticEvent = {
  _id: string;
  agentId: string;
  createdAt: number;
  eventType: string;
  summary: string;
  payload: unknown;
  sessionKey?: string;
  runId?: string;
  level?: string;
  toolName?: string;
  durationMs?: number;
  success?: boolean;
};

function normalizeTimestamp(value: string, fallback: number): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return null;
}

function resolveStringField(
  record: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function resolveNumberField(...values: Array<unknown>): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function resolveBooleanField(...values: Array<unknown>): boolean | null {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

function formatSnippet(value: unknown, limit = 120): string | null {
  if (typeof value === "string") {
    return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  try {
    const json = JSON.stringify(value);
    if (!json) {
      return null;
    }
    return json.length > limit ? `${json.slice(0, limit - 3)}...` : json;
  } catch {
    return null;
  }
}

function formatDurationMs(durationMs: number | null): string | null {
  if (!durationMs || durationMs <= 0) {
    return null;
  }
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function summarizeDiagnosticPayload(
  eventType: string,
  record: Record<string, unknown>
): string {
  const detail = resolveStringField(record, [
    "message",
    "detail",
    "summary",
    "error",
    "errorMessage",
    "description",
    "note",
  ]);
  const label = resolveStringField(record, [
    "eventType",
    "type",
    "name",
    "kind",
    "category",
    "level",
    "severity",
    "code",
  ]);
  if (detail && label) {
    return `${label}: ${detail}`;
  }
  if (detail) {
    return detail;
  }
  if (label) {
    return label;
  }
  return eventType;
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
  const delta = asRecord(record.delta);
  const summary = asRecord(record.summary);

  if (eventType.startsWith("diagnostic")) {
    return summarizeDiagnosticPayload(eventType, record);
  }

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
    case "tool_call": {
      const toolName =
        resolveStringField(record, ["toolName", "tool_name"]) ??
        (delta ? resolveStringField(delta, ["toolName", "tool_name"]) : null);
      const toolInput =
        record.toolInput ?? record.tool_input ?? (delta ? delta.toolInput : null);
      const inputPreview = formatSnippet(toolInput);
      return toolName
        ? `Tool call: ${toolName}${inputPreview ? ` - ${inputPreview}` : ""}`
        : inputPreview
          ? `Tool call - ${inputPreview}`
          : "Tool call";
    }
    case "tool_result": {
      const toolName =
        resolveStringField(record, ["toolName", "tool_name"]) ??
        (delta ? resolveStringField(delta, ["toolName", "tool_name"]) : null);
      const toolOutput =
        record.toolOutput ?? record.tool_output ?? (delta ? delta.toolOutput : null);
      const outputPreview = formatSnippet(toolOutput);
      return toolName
        ? `Tool result: ${toolName}${outputPreview ? ` - ${outputPreview}` : ""}`
        : outputPreview
          ? `Tool result - ${outputPreview}`
          : "Tool result";
    }
    case "thinking": {
      const thinking =
        resolveStringField(record, ["thinking", "thought", "message", "content"]) ??
        (delta ? resolveStringField(delta, ["content"]) : null);
      return thinking ? `Thinking: ${thinking}` : "Thinking...";
    }
    case "error": {
      const message = resolveStringField(record, [
        "message",
        "error",
        "errorMessage",
        "status",
      ]);
      return message ? `Error: ${message}` : "Error event";
    }
    case "token_usage": {
      const inputTokens =
        resolveNumberField(record.inputTokens, record.input_tokens, summary?.inputTokens, summary?.input_tokens) ??
        null;
      const outputTokens =
        resolveNumberField(record.outputTokens, record.output_tokens, summary?.outputTokens, summary?.output_tokens) ??
        null;
      const durationMs =
        resolveNumberField(record.durationMs, record.duration_ms, summary?.durationMs, summary?.duration_ms) ??
        null;
      const total =
        inputTokens !== null && outputTokens !== null
          ? inputTokens + outputTokens
          : inputTokens ?? outputTokens;
      const durationLabel = formatDurationMs(durationMs);
      const tokenLabel = total !== null ? `${total.toLocaleString()} tokens` : "Token usage";
      if (inputTokens !== null || outputTokens !== null) {
        const parts = [
          inputTokens !== null ? `${inputTokens.toLocaleString()} in` : null,
          outputTokens !== null ? `${outputTokens.toLocaleString()} out` : null,
        ].filter(Boolean);
        return `${tokenLabel}${parts.length > 0 ? ` (${parts.join(" / ")})` : ""}${
          durationLabel ? ` · ${durationLabel}` : ""
        }`;
      }
      return `${tokenLabel}${durationLabel ? ` · ${durationLabel}` : ""}`;
    }
    case "session_start": {
      const sessionKey = resolveStringField(record, ["sessionKey", "session_key"]);
      const agentId = resolveStringField(record, ["agentId", "agent_id"]);
      return sessionKey
        ? `Session started: ${sessionKey}${agentId ? ` (${agentId})` : ""}`
        : "Session started";
    }
    case "session_end": {
      const sessionKey = resolveStringField(record, ["sessionKey", "session_key"]);
      const durationMs = resolveNumberField(record.durationMs, record.duration_ms);
      const durationLabel = formatDurationMs(durationMs);
      const messageCount = resolveNumberField(record.messageCount, record.message_count);
      const parts = [
        durationLabel ? `duration: ${durationLabel}` : null,
        messageCount !== null ? `${messageCount} messages` : null,
      ].filter(Boolean);
      return sessionKey
        ? `Session ended: ${sessionKey}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`
        : `Session ended${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`;
    }
    case "memory_operation": {
      const operation = resolveStringField(record, ["operation", "op"]);
      const memoryType = resolveStringField(record, ["memoryType", "memory_type", "type"]);
      const key = resolveStringField(record, ["key", "name"]);
      const success = resolveBooleanField(record.success, record.ok);
      const statusLabel = success === false ? " [FAILED]" : "";
      if (operation && memoryType) {
        return `Memory ${operation}: ${memoryType}${key ? ` (${key})` : ""}${statusLabel}`;
      }
      if (operation) {
        return `Memory ${operation}${key ? `: ${key}` : ""}${statusLabel}`;
      }
      return `Memory operation${key ? `: ${key}` : ""}${statusLabel}`;
    }
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

  if (delta) {
    if (typeof delta.content === "string") {
      return delta.content;
    }
    const deltaType = resolveStringField(delta, ["type"]);
    if (deltaType === "tool_call") {
      return summarizePayload("tool_call", { ...record, ...delta });
    }
    if (deltaType === "tool_result") {
      return summarizePayload("tool_result", { ...record, ...delta });
    }
    if (deltaType === "thinking") {
      return summarizePayload("thinking", { ...record, ...delta });
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
    receivedAt: event.receivedAt,
    type: event.eventType,
    content: summarizePayload(event.eventType, event.payload),
  };
}

async function buildDisplayAgentMap(
  ctx: QueryCtx,
  agentIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(agentIds));
  const lookups = await Promise.all(
    uniqueIds.map(async (agentId) => resolveAgentLookup(ctx, agentId))
  );
  const display = new Map<string, string>();
  for (let i = 0; i < uniqueIds.length; i++) {
    const lookup = lookups[i];
    if (lookup?.bridgeId) {
      display.set(uniqueIds[i], lookup.bridgeId);
    }
  }
  return display;
}

function isDiagnosticRelevant(eventType: string): boolean {
  return (
    eventType.startsWith("diagnostic") ||
    eventType === "tool_call" ||
    eventType === "tool_result" ||
    eventType === "error" ||
    eventType === "token_usage" ||
    eventType === "memory_operation" ||
    eventType === "health"
  );
}

function resolveDiagnosticLevel(
  eventType: string,
  record: Record<string, unknown>
): string | undefined {
  const explicit = resolveStringField(record, [
    "level",
    "severity",
    "status",
  ]);
  if (explicit) {
    return explicit.toLowerCase();
  }
  if (eventType.includes("error")) {
    return "error";
  }
  if (eventType.includes("warn")) {
    return "warning";
  }
  if (eventType.includes("info")) {
    return "info";
  }
  if (eventType === "health") {
    const ok = resolveBooleanField(record.ok);
    return ok === null ? undefined : ok ? "ok" : "error";
  }
  return undefined;
}

function resolveToolName(record: Record<string, unknown>): string | null {
  return resolveStringField(record, ["toolName", "tool_name", "name"]);
}

function resolveDurationMs(record: Record<string, unknown>): number | null {
  return resolveNumberField(
    record.durationMs,
    record.duration_ms,
    record.latencyMs,
    record.latency_ms,
    record.elapsedMs,
    record.elapsed_ms
  );
}

function resolveSuccess(eventType: string, record: Record<string, unknown>): boolean | null {
  const ok = resolveBooleanField(record.ok);
  if (ok !== null) {
    return ok;
  }
  const status = resolveStringField(record, ["status", "state", "result"]);
  if (status) {
    const normalized = status.toLowerCase();
    if (["ok", "success", "succeeded", "completed", "done"].includes(normalized)) {
      return true;
    }
    if (["error", "failed", "failure", "timeout"].includes(normalized)) {
      return false;
    }
  }
  if (resolveStringField(record, ["error", "errorMessage"])) {
    return false;
  }
  if (eventType === "error") {
    return false;
  }
  return null;
}

function normalizeDiagnosticEvent(event: {
  _id: string;
  receivedAt: number;
  timestamp: string;
  agentId: string;
  eventType: string;
  payload: unknown;
  sessionKey?: string;
  runId?: string;
}): DiagnosticEvent {
  const createdAt = normalizeTimestamp(event.timestamp, event.receivedAt);
  const record = asRecord(event.payload);
  const level = record ? resolveDiagnosticLevel(event.eventType, record) : undefined;
  const toolName = record ? resolveToolName(record) : null;
  const durationMs = record ? resolveDurationMs(record) : null;
  const success = record ? resolveSuccess(event.eventType, record) : null;

  return {
    _id: event._id,
    agentId: event.agentId,
    createdAt,
    eventType: event.eventType,
    summary: summarizePayload(event.eventType, event.payload),
    payload: event.payload,
    sessionKey: event.sessionKey,
    runId: event.runId,
    level: level ?? undefined,
    toolName: toolName ?? undefined,
    durationMs: durationMs ?? undefined,
    success: success ?? undefined,
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
    const receivedAt = Date.now();
    await ctx.runMutation(internal.events.store, { ...event, receivedAt });
    switch (event.eventType) {
      case "agent":
        await ctx.runMutation(internal.conversations.processAgentEvent, event);
        await ctx.runMutation(internal.agents.updateActivityFromEvent, {
          agentId: event.agentId,
          sessionKey: event.sessionKey,
          receivedAt,
        });
        break;
      case "chat":
        await ctx.runMutation(internal.conversations.processChatEvent, event);
        await ctx.runMutation(internal.agents.updateActivityFromEvent, {
          agentId: event.agentId,
          sessionKey: event.sessionKey,
          receivedAt,
        });
        break;
      case "presence":
      case "heartbeat":
        await ctx.runMutation(internal.agents.updateStatusFromEvent, event);
        break;
      case "session_start":
        if (event.sessionKey) {
          await ctx.runMutation(internal.events.startSession, {
            agentId: event.agentId,
            sessionKey: event.sessionKey,
            startedAt: receivedAt,
          });
        }
        break;
      case "session_end":
        if (event.sessionKey) {
          await ctx.runMutation(internal.events.endSession, {
            agentId: event.agentId,
            sessionKey: event.sessionKey,
            endedAt: receivedAt,
            payload: event.payload,
          });
        }
        break;
      case "tool_call":
      case "tool_result":
        if (event.sessionKey) {
          await ctx.runMutation(internal.events.incrementSessionToolCount, {
            sessionKey: event.sessionKey,
            payload: event.payload,
          });
        }
        break;
      case "error":
        if (event.sessionKey) {
          await ctx.runMutation(internal.events.incrementSessionErrorCount, {
            sessionKey: event.sessionKey,
          });
        }
        break;
      case "thinking":
        if (event.sessionKey) {
          await ctx.runMutation(internal.events.incrementSessionThinkingCount, {
            sessionKey: event.sessionKey,
          });
        }
        break;
      case "token_usage":
        if (event.sessionKey) {
          await ctx.runMutation(internal.events.addSessionTokenUsage, {
            sessionKey: event.sessionKey,
            payload: event.payload,
          });
        }
        break;
      case "memory_operation":
        if (event.sessionKey) {
          await ctx.runMutation(internal.events.recordMemoryOperation, {
            sessionKey: event.sessionKey,
            payload: event.payload,
          });
        }
        break;
      default:
        break;
    }
  }

  return new Response("ok");
});

/**
 * Store a raw Gateway event (idempotent by eventId).
 * Extracts denormalized fields for efficient querying.
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

    const normalizedAgentId = normalizeAgentIdForLookup(args.agentId);
    const agentRecord = normalizedAgentId
      ? await resolveOrCreateAgentRecord(ctx, normalizedAgentId)
      : null;
    const canonicalAgentId = agentRecord?._id ?? normalizedAgentId ?? args.agentId;

    const receivedAt = args.receivedAt ?? Date.now();

    // Extract denormalized fields from payload
    const record = asRecord(args.payload);
    const toolName = record
      ? resolveStringField(record, ["toolName", "tool_name", "name"])
      : null;
    const errorCode = record
      ? resolveStringField(record, ["code", "errorCode", "error_code"])
      : null;
    const durationMs = record ? resolveDurationMs(record) : null;

    return await ctx.db.insert("events", {
      ...args,
      agentId: canonicalAgentId,
      receivedAt,
      toolName: toolName ?? undefined,
      errorCode: errorCode ?? undefined,
      durationMs: durationMs ?? undefined,
    });
  },
});

/**
 * Start a new session and create session metrics record.
 */
export const startSession = internalMutation({
  args: {
    agentId: v.string(),
    sessionKey: v.string(),
    startedAt: v.number(),
  },
  handler: async (ctx, args): Promise<string> => {
    const existing = await ctx.db
      .query("sessionMetrics")
      .withIndex("by_session", (q) => q.eq("sessionKey", args.sessionKey))
      .first();

    if (existing) {
      // Session already exists, just update status if needed
      if (existing.status !== "active") {
        await ctx.db.patch(existing._id, {
          status: "active",
          lastActivityAt: args.startedAt,
          updatedAt: args.startedAt,
        });
      }
      return existing._id;
    }

    return await ctx.db.insert("sessionMetrics", {
      sessionKey: args.sessionKey,
      agentId: args.agentId,
      startedAt: args.startedAt,
      status: "active",
      messageCount: 0,
      toolCallCount: 0,
      errorCount: 0,
      thinkingEventCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      memoryReadCount: 0,
      memoryWriteCount: 0,
      lastActivityAt: args.startedAt,
      updatedAt: args.startedAt,
    });
  },
});

/**
 * End a session and record final metrics.
 */
export const endSession = internalMutation({
  args: {
    agentId: v.string(),
    sessionKey: v.string(),
    endedAt: v.number(),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query("sessionMetrics")
      .withIndex("by_session", (q) => q.eq("sessionKey", args.sessionKey))
      .first();

    if (!existing) {
      // Create a completed session record
      await ctx.db.insert("sessionMetrics", {
        sessionKey: args.sessionKey,
        agentId: args.agentId,
        startedAt: args.endedAt,
        endedAt: args.endedAt,
        durationMs: 0,
        status: "completed",
        messageCount: 0,
        toolCallCount: 0,
        errorCount: 0,
        thinkingEventCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        memoryReadCount: 0,
        memoryWriteCount: 0,
        lastActivityAt: args.endedAt,
        updatedAt: args.endedAt,
      });
      return;
    }

    const record = asRecord(args.payload);
    const durationMs =
      record
        ? resolveNumberField(record.durationMs, record.duration_ms)
        : null;
    const computedDuration = durationMs ?? args.endedAt - existing.startedAt;

    await ctx.db.patch(existing._id, {
      endedAt: args.endedAt,
      durationMs: computedDuration,
      status: "completed",
      lastActivityAt: args.endedAt,
      updatedAt: args.endedAt,
    });
  },
});

/**
 * Increment tool call count for a session.
 */
export const incrementSessionToolCount = internalMutation({
  args: {
    sessionKey: v.string(),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query("sessionMetrics")
      .withIndex("by_session", (q) => q.eq("sessionKey", args.sessionKey))
      .first();

    if (!existing) {
      return;
    }

    const now = Date.now();
    const record = asRecord(args.payload);
    const durationMs = record ? resolveDurationMs(record) : null;

    const updates: Record<string, unknown> = {
      toolCallCount: existing.toolCallCount + 1,
      lastActivityAt: now,
      updatedAt: now,
    };

    // Update max tool duration if applicable
    if (durationMs !== null) {
      if (
        existing.maxToolDurationMs === undefined ||
        durationMs > existing.maxToolDurationMs
      ) {
        updates.maxToolDurationMs = durationMs;
      }

      // Recalculate average tool duration
      const currentTotal =
        (existing.avgToolDurationMs ?? 0) * existing.toolCallCount;
      const newAvg = (currentTotal + durationMs) / (existing.toolCallCount + 1);
      updates.avgToolDurationMs = Math.round(newAvg);
    }

    await ctx.db.patch(existing._id, updates);
  },
});

/**
 * Increment error count for a session.
 */
export const incrementSessionErrorCount = internalMutation({
  args: {
    sessionKey: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query("sessionMetrics")
      .withIndex("by_session", (q) => q.eq("sessionKey", args.sessionKey))
      .first();

    if (!existing) {
      return;
    }

    const now = Date.now();
    await ctx.db.patch(existing._id, {
      errorCount: existing.errorCount + 1,
      lastActivityAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Increment thinking event count for a session.
 */
export const incrementSessionThinkingCount = internalMutation({
  args: {
    sessionKey: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query("sessionMetrics")
      .withIndex("by_session", (q) => q.eq("sessionKey", args.sessionKey))
      .first();

    if (!existing) {
      return;
    }

    const now = Date.now();
    await ctx.db.patch(existing._id, {
      thinkingEventCount: existing.thinkingEventCount + 1,
      lastActivityAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Add token usage to session totals.
 */
export const addSessionTokenUsage = internalMutation({
  args: {
    sessionKey: v.string(),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query("sessionMetrics")
      .withIndex("by_session", (q) => q.eq("sessionKey", args.sessionKey))
      .first();

    if (!existing) {
      return;
    }

    const record = asRecord(args.payload);
    if (!record) {
      return;
    }

    const inputTokens = resolveNumberField(
      record.inputTokens,
      record.input_tokens
    );
    const outputTokens = resolveNumberField(
      record.outputTokens,
      record.output_tokens
    );
    const cacheReadTokens = resolveNumberField(
      record.cacheReadTokens,
      record.cache_read_tokens
    );
    const cacheWriteTokens = resolveNumberField(
      record.cacheWriteTokens,
      record.cache_write_tokens
    );
    const costUsd = resolveNumberField(record.costUsd, record.cost_usd);

    const now = Date.now();
    const updates: Record<string, unknown> = {
      lastActivityAt: now,
      updatedAt: now,
    };

    if (inputTokens !== null) {
      updates.totalInputTokens = existing.totalInputTokens + inputTokens;
    }
    if (outputTokens !== null) {
      updates.totalOutputTokens = existing.totalOutputTokens + outputTokens;
    }
    if (cacheReadTokens !== null) {
      updates.totalCacheReadTokens =
        (existing.totalCacheReadTokens ?? 0) + cacheReadTokens;
    }
    if (cacheWriteTokens !== null) {
      updates.totalCacheWriteTokens =
        (existing.totalCacheWriteTokens ?? 0) + cacheWriteTokens;
    }
    if (costUsd !== null) {
      updates.estimatedCostUsd = (existing.estimatedCostUsd ?? 0) + costUsd;
    }

    await ctx.db.patch(existing._id, updates);
  },
});

/**
 * Record a memory operation for a session.
 */
export const recordMemoryOperation = internalMutation({
  args: {
    sessionKey: v.string(),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query("sessionMetrics")
      .withIndex("by_session", (q) => q.eq("sessionKey", args.sessionKey))
      .first();

    if (!existing) {
      return;
    }

    const record = asRecord(args.payload);
    const operation = record
      ? resolveStringField(record, ["operation", "op"])
      : null;

    const now = Date.now();
    const updates: Record<string, unknown> = {
      lastActivityAt: now,
      updatedAt: now,
    };

    if (operation === "read") {
      updates.memoryReadCount = existing.memoryReadCount + 1;
    } else if (
      operation === "write" ||
      operation === "update" ||
      operation === "sync"
    ) {
      updates.memoryWriteCount = existing.memoryWriteCount + 1;
    }

    await ctx.db.patch(existing._id, updates);
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
    const normalizedInput = normalizeAgentIdForLookup(args.agentId);
    if (!normalizedInput) {
      return [];
    }
    const lookup = await resolveAgentLookup(ctx, normalizedInput);
    const lookupIds = lookup?.lookupIds ?? [normalizedInput];
    const results = await Promise.all(
      lookupIds.map((lookupId) =>
        ctx.db
          .query("events")
          .withIndex("by_agent", (q) => q.eq("agentId", lookupId))
          .order("desc")
          .take(args.limit ?? 100)
      )
    );
    const merged = new Map<string, Doc<"events">>();
    for (const event of results.flat()) {
      merged.set(event._id, event);
    }
    const sorted = Array.from(merged.values()).sort(
      (a, b) =>
        normalizeTimestamp(b.timestamp, b.receivedAt) -
        normalizeTimestamp(a.timestamp, a.receivedAt)
    );
    const limited = sorted.slice(0, args.limit ?? 100);
    const displayMap = await buildDisplayAgentMap(
      ctx,
      limited.map((event) => event.agentId)
    );

    return limited.map((event) =>
      normalizeEvent({
        _id: event._id,
        receivedAt: event.receivedAt,
        timestamp: event.timestamp,
        agentId: displayMap.get(event.agentId) ?? event.agentId,
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
      const displayMap = await buildDisplayAgentMap(
        ctx,
        events.map((event) => event.agentId)
      );

      return events.map((event) =>
        normalizeEvent({
          _id: event._id,
          receivedAt: event.receivedAt,
          timestamp: event.timestamp,
          agentId: displayMap.get(event.agentId) ?? event.agentId,
          eventType: event.eventType,
          payload: event.payload,
        })
      );
    }

    const events = await ctx.db
      .query("events")
      .order("desc")
      .take(args.limit ?? 50);
    const displayMap = await buildDisplayAgentMap(
      ctx,
      events.map((event) => event.agentId)
    );

    return events.map((event) =>
      normalizeEvent({
        _id: event._id,
        receivedAt: event.receivedAt,
        timestamp: event.timestamp,
        agentId: displayMap.get(event.agentId) ?? event.agentId,
        eventType: event.eventType,
        payload: event.payload,
      })
    );
  },
});

/**
 * Get diagnostic-focused events (tooling, errors, performance, diagnostics).
 */
export const listDiagnostics = query({
  args: {
    limit: v.optional(v.number()),
    agentId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<DiagnosticEvent[]> => {
    const limit = Math.min(Math.max(args.limit ?? 80, 10), 200);
    const takeCount = Math.min(500, Math.max(limit * 4, 200));

    let events: Array<{
      _id: string;
      receivedAt: number;
      timestamp: string;
      agentId: string;
      eventType: string;
      payload: unknown;
      sessionKey?: string;
      runId?: string;
    }> = [];

    if (args.agentId) {
      const normalizedInput = normalizeAgentIdForLookup(args.agentId);
      if (!normalizedInput) {
        return [];
      }
      const bridgeAgentId = await resolveBridgeAgentId(ctx, normalizedInput);
      if (!bridgeAgentId) {
        return [];
      }
      events = await ctx.db
        .query("events")
        .withIndex("by_agent", (q) => q.eq("agentId", bridgeAgentId))
        .order("desc")
        .take(takeCount);
    } else {
      events = await ctx.db.query("events").order("desc").take(takeCount);
    }

    const filtered = events.filter((event) => isDiagnosticRelevant(event.eventType));

    return filtered.slice(0, limit).map((event) =>
      normalizeDiagnosticEvent({
        _id: event._id,
        receivedAt: event.receivedAt,
        timestamp: event.timestamp,
        agentId: event.agentId,
        eventType: event.eventType,
        payload: event.payload,
        sessionKey: event.sessionKey,
        runId: event.runId,
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
    // Limit to 1000 events per type to avoid exceeding Convex read limits (16MB)
    // TODO: Consider adding a receivedAt index for more efficient time-based queries
    const entries = await Promise.all(
      eventTypes.map(async (type) => {
        const events = await ctx.db
          .query("events")
          .withIndex("by_type", (q) => q.eq("eventType", type))
          .order("desc")
          .take(1000);
        const total = since
          ? events.filter((event) => event.receivedAt >= since).length
          : events.length;
        return [type, total] as const;
      })
    );

    return Object.fromEntries(entries) as Record<(typeof eventTypes)[number], number>;
  },
});

/**
 * Get session metrics for an agent.
 */
export const listSessionMetrics = query({
  args: {
    agentId: v.optional(v.string()),
    limit: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("paused"),
        v.literal("completed"),
        v.literal("failed")
      )
    ),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);

    if (args.agentId) {
      const normalizedInput = normalizeAgentIdForLookup(args.agentId);
      if (!normalizedInput) {
        return [];
      }
      const bridgeAgentId = await resolveBridgeAgentId(ctx, normalizedInput);
      if (!bridgeAgentId) {
        return [];
      }
      const results = await ctx.db
        .query("sessionMetrics")
        .withIndex("by_agent", (q) => q.eq("agentId", bridgeAgentId))
        .order("desc")
        .take(limit * 2);

      const filtered = args.status
        ? results.filter((s) => s.status === args.status)
        : results;
      return filtered.slice(0, limit);
    }

    if (args.status) {
      return await ctx.db
        .query("sessionMetrics")
        .withIndex("by_status", (q) => q.eq("status", args.status))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("sessionMetrics")
      .withIndex("by_started")
      .order("desc")
      .take(limit);
  },
});

/**
 * Get session metrics by session key.
 */
export const getSessionMetrics = query({
  args: {
    sessionKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessionMetrics")
      .withIndex("by_session", (q) => q.eq("sessionKey", args.sessionKey))
      .first();
  },
});
