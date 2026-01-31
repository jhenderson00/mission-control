"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { useConnectionStatus } from "./connection-store";

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

  const events = useMemo<ActivityEvent[]>(
    () => (data ?? []) as ActivityEvent[],
    [data]
  );

  return {
    events,
    isLoading: data === undefined,
  };
}
