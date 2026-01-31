"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { useConnectionStatus } from "./connection-store";

export type AgentStatusRecord = {
  agentId: string;
  status: "online" | "degraded" | "offline";
  lastHeartbeat: number;
  lastActivity: number;
  currentSession?: string;
};

type UseAgentStatusOptions = {
  agentIds?: string[];
};

export function useAgentStatus(options: UseAgentStatusOptions = {}) {
  useConnectionStatus();

  const agentIds =
    options.agentIds && options.agentIds.length > 0 ? options.agentIds : undefined;
  const data = useQuery(api.agents.listStatus, { agentIds });

  const statuses = useMemo<AgentStatusRecord[]>(
    () => (data ?? []) as AgentStatusRecord[],
    [data]
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
  };
}
