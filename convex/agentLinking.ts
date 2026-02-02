import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type AgentLinkingCtx = QueryCtx | MutationCtx;

function normalizeAgentIdInput(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function resolveAgentRecord(
  ctx: AgentLinkingCtx,
  agentId: string
): Promise<Doc<"agents"> | null> {
  const normalized = normalizeAgentIdInput(agentId);
  if (!normalized) {
    return null;
  }

  const directId = ctx.db.normalizeId("agents", normalized);
  if (directId) {
    const record = await ctx.db.get(directId as Id<"agents">);
    if (record) {
      return record;
    }
  }

  const byBridge = await ctx.db
    .query("agents")
    .withIndex("by_bridge_agent_id", (q) => q.eq("bridgeAgentId", normalized))
    .first();

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

  const directId = ctx.db.normalizeId("agents", normalized);
  if (directId) {
    const record = await ctx.db.get(directId as Id<"agents">);
    return record ? directId : null;
  }

  const byBridge = await ctx.db
    .query("agents")
    .withIndex("by_bridge_agent_id", (q) => q.eq("bridgeAgentId", normalized))
    .first();

  return byBridge?._id ?? null;
}

export function normalizeAgentIdForLookup(value: string): string | null {
  return normalizeAgentIdInput(value);
}
