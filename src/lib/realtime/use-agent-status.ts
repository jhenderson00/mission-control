"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { useConnectionStatus } from "./connection-store";
import { useStateSync } from "./state-sync";

export type AgentStatusRecord = {
  agentId: string;
  status: "online" | "offline" | "busy" | "paused";
  lastHeartbeat: number;
  lastActivity: number;
  currentSession?: string;
  sessionInfo?: Record<string, unknown>;
  workingMemory?: {
    currentTask: string;
    status: string;
    progress?: string;
    nextSteps: string[];
    updatedAt: number;
  };
};

type UseAgentStatusOptions = {
  agentIds?: string[];
};

export function useAgentStatus(options: UseAgentStatusOptions = {}) {
  useConnectionStatus();

  // Filter out undefined/null values to prevent Convex errors
  const filteredIds = options.agentIds?.filter((id): id is string => Boolean(id));
  const agentIds =
    filteredIds && filteredIds.length > 0 ? filteredIds : undefined;
  const data = useQuery(api.agents.listStatus, { agentIds });

  const sync = useStateSync<AgentStatusRecord>({
    key: "agent-status",
    items: data === undefined ? undefined : (data as AgentStatusRecord[]),
    getId: (status) => status.agentId,
    getTimestamp: (status) =>
      Math.max(status.lastActivity ?? 0, status.lastHeartbeat ?? 0),
  });

  const statuses = useMemo<AgentStatusRecord[]>(
    () => sync.items,
    [sync.items]
  );

  const statusByAgent = useMemo(() => {
    const map = new Map<string, AgentStatusRecord>();
    for (const status of statuses) {
      map.set(status.agentId, status);
    }
    return map;
  }, [statuses]);

  return {
    statuses,
    statusByAgent,
    isLoading: data === undefined,
    isSyncing: sync.isSyncing,
    hasGap: sync.hasGap,
    isStale: sync.isStale,
  };
}
