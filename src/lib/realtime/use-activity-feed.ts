"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { useConnectionStatus } from "./connection-store";
import { useStateSync } from "./state-sync";

export type ActivityEvent = {
  _id: string;
  agentId: string;
  createdAt: number;
  type: string;
  content: string;
};

type UseActivityFeedOptions = {
  limit?: number;
  type?: string;
};

export function useActivityFeed(options: UseActivityFeedOptions = {}) {
  useConnectionStatus();

  const data = useQuery(api.events.listRecent, {
    limit: options.limit,
    type: options.type,
  });

  const sync = useStateSync<ActivityEvent>({
    key: `activity:${options.type ?? "all"}`,
    items: data === undefined ? undefined : (data as ActivityEvent[]),
    getId: (event) => event._id,
    getTimestamp: (event) => event.createdAt,
  });

  const events = useMemo<ActivityEvent[]>(
    () => sync.items,
    [sync.items]
  );

  return {
    events,
    isLoading: data === undefined,
    isSyncing: sync.isSyncing,
    hasGap: sync.hasGap,
    isStale: sync.isStale,
  };
}
