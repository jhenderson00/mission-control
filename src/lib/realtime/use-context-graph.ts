"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useConnectionStatus } from "./connection-store";
import { useStateSync } from "./state-sync";

export type ContextGraphNodeType = "agent" | "decision" | "task";

export type ContextGraphNode = {
  id: string;
  sourceId: string;
  type: ContextGraphNodeType;
  label: string;
  summary?: string;
  status?: string;
  decisionType?: string;
  importance?: string;
  createdAt?: number;
  metadata?: Record<string, unknown>;
};

export type ContextGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: "decision_parent" | "decision_task" | "decision_agent" | "task_parent";
};

export type ContextGraphData = {
  nodes: ContextGraphNode[];
  edges: ContextGraphEdge[];
};

type UseContextGraphOptions = {
  agentId?: string;
  decisionType?: string;
  timeRangeMs?: number;
  limit?: number;
};

export function useContextGraph(options: UseContextGraphOptions = {}) {
  useConnectionStatus();

  const data = useQuery(api.contextGraph.getGraph, {
    agentId: options.agentId,
    decisionType: options.decisionType,
    timeRangeMs: options.timeRangeMs,
    limit: options.limit,
  }) as ContextGraphData | undefined;

  const sync = useStateSync<ContextGraphNode>({
    key: `context-graph:${options.agentId ?? "all"}:${options.decisionType ?? "all"}:${options.timeRangeMs ?? "all"}`,
    items: data?.nodes,
    getId: (node) => node.id,
    getTimestamp: (node) => node.createdAt,
  });

  const nodes = useMemo<ContextGraphNode[]>(() => sync.items, [sync.items]);
  const edges = useMemo<ContextGraphEdge[]>(() => data?.edges ?? [], [data?.edges]);

  const filteredEdges = useMemo(() => {
    if (!nodes.length) return [];
    const ids = new Set(nodes.map((node) => node.id));
    return edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  }, [edges, nodes]);

  return {
    nodes,
    edges: filteredEdges,
    isLoading: data === undefined,
    isSyncing: sync.isSyncing,
    hasGap: sync.hasGap,
    isStale: sync.isStale,
  };
}
