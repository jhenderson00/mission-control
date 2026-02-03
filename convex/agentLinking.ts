import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  DEFAULT_AGENT_HOST,
  DEFAULT_AGENT_MODEL,
  DEFAULT_AGENT_STATUS,
  DEFAULT_AGENT_TYPE,
} from "./agentDefaults";

type AgentLinkingCtx = QueryCtx | MutationCtx;

const AGENT_CACHE_LIMIT = 500;
const agentRecordCache = new Map<string, Doc<"agents">>();

function normalizeAgentIdInput(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getCachedAgentRecord(key: string): Doc<"agents"> | null {
  const cached = agentRecordCache.get(key);
  if (!cached) {
    return null;
  }
  agentRecordCache.delete(key);
  agentRecordCache.set(key, cached);
  return cached;
}

function setCachedAgentRecord(key: string, record: Doc<"agents">): void {
  if (!key) {
    return;
  }
  agentRecordCache.delete(key);
  agentRecordCache.set(key, record);
  if (agentRecordCache.size > AGENT_CACHE_LIMIT) {
    const oldestKey = agentRecordCache.keys().next().value;
    if (oldestKey) {
      agentRecordCache.delete(oldestKey);
    }
  }
}

function cacheAgentRecord(record: Doc<"agents">): void {
  setCachedAgentRecord(record._id, record);
  if (record.bridgeAgentId) {
    setCachedAgentRecord(record.bridgeAgentId, record);
  }
}

export async function resolveAgentRecord(
  ctx: AgentLinkingCtx,
  agentId: string
): Promise<Doc<"agents"> | null> {
  const normalized = normalizeAgentIdInput(agentId);
  if (!normalized) {
    return null;
  }

  const cached = getCachedAgentRecord(normalized);
  if (cached) {
    return cached;
  }

  const directId = ctx.db.normalizeId("agents", normalized);
  if (directId) {
    const record = await ctx.db.get(directId as Id<"agents">);
    if (record) {
      cacheAgentRecord(record);
      return record;
    }
  }

  const byBridge = await ctx.db
    .query("agents")
    .withIndex("by_bridge_agent_id", (q) => q.eq("bridgeAgentId", normalized))
    .first();

  if (byBridge) {
    cacheAgentRecord(byBridge);
  }

  return byBridge ?? null;
}

export async function resolveBridgeAgentId(
  ctx: AgentLinkingCtx,
  agentId: string
): Promise<string | null> {
  const normalized = normalizeAgentIdInput(agentId);
  if (!normalized) {
    return null;
  }

  const record = await resolveAgentRecord(ctx, normalized);
  if (record?.bridgeAgentId) {
    return record.bridgeAgentId;
  }

  return normalized;
}

export async function resolveConvexAgentId(
  ctx: AgentLinkingCtx,
  agentId: string
): Promise<Id<"agents"> | null> {
  const normalized = normalizeAgentIdInput(agentId);
  if (!normalized) {
    return null;
  }

  const record = await resolveAgentRecord(ctx, normalized);
  return record?._id ?? null;
}

export async function resolveOrCreateAgentRecord(
  ctx: MutationCtx,
  agentId: string
): Promise<Doc<"agents"> | null> {
  const normalized = normalizeAgentIdInput(agentId);
  if (!normalized) {
    return null;
  }

  const cached = getCachedAgentRecord(normalized);
  if (cached) {
    return cached;
  }

  const existing = await resolveAgentRecord(ctx, normalized);
  if (existing) {
    return existing;
  }

  const now = Date.now();
  const id = await ctx.db.insert("agents", {
    name: normalized,
    bridgeAgentId: normalized,
    type: DEFAULT_AGENT_TYPE,
    model: DEFAULT_AGENT_MODEL,
    host: DEFAULT_AGENT_HOST,
    status: DEFAULT_AGENT_STATUS,
    createdAt: now,
    updatedAt: now,
  });

  const record = await ctx.db.get(id);
  if (record) {
    cacheAgentRecord(record);
  }
  return record ?? null;
}

export type AgentLookup = {
  normalized: string;
  bridgeId: string | null;
  convexId: Id<"agents"> | null;
  lookupIds: string[];
  record: Doc<"agents"> | null;
};

export async function resolveAgentLookup(
  ctx: AgentLinkingCtx,
  agentId: string
): Promise<AgentLookup | null> {
  const normalized = normalizeAgentIdInput(agentId);
  if (!normalized) {
    return null;
  }

  const record = await resolveAgentRecord(ctx, normalized);
  const lookupIds = new Set<string>([normalized]);
  if (record?._id) {
    lookupIds.add(record._id);
  }
  if (record?.bridgeAgentId) {
    lookupIds.add(record.bridgeAgentId);
  }

  return {
    normalized,
    bridgeId: record?.bridgeAgentId ?? null,
    convexId: record?._id ?? null,
    lookupIds: Array.from(lookupIds),
    record: record ?? null,
  };
}

export function normalizeAgentIdForLookup(value: string): string | null {
  return normalizeAgentIdInput(value);
}
