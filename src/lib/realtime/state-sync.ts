"use client";

import { useEffect, useMemo, useRef } from "react";
import { useConnectionStore } from "./connection-store";

export const DEFAULT_GAP_THRESHOLD_MS = 2 * 60 * 1000;
export const DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000;

export type SyncResult<T> = {
  items: T[];
  latestEventTime: number;
  hasGap: boolean;
  isStale: boolean;
  isSyncing: boolean;
};

type SyncOptions<T> = {
  key: string;
  items: T[] | undefined;
  getId: (item: T) => string | number | undefined | null;
  getTimestamp: (item: T) => number | undefined;
  getSequence?: (item: T) => number | undefined;
  gapThresholdMs?: number;
  staleAfterMs?: number;
};

export function dedupeById<T>(
  items: T[],
  getId: (item: T) => string | number | undefined | null
): T[] {
  const seen = new Set<string | number>();
  const deduped: T[] = [];

  for (const item of items) {
    const key = getId(item);
    if (key === undefined || key === null) {
      deduped.push(item);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function detectSequenceGap<T>(
  items: T[],
  getSequence: (item: T) => number | undefined
): boolean {
  const sequences = items
    .map((item) => getSequence(item))
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b);

  for (let index = 1; index < sequences.length; index += 1) {
    if (sequences[index] - sequences[index - 1] > 1) {
      return true;
    }
  }

  return false;
}

export function detectTimeGap(
  latestEventTime: number,
  previousEventTime: number,
  thresholdMs: number
): boolean {
  if (!latestEventTime || !previousEventTime) return false;
  return latestEventTime - previousEventTime > thresholdMs;
}

export function useStateSync<T>({
  key,
  items,
  getId,
  getTimestamp,
  getSequence,
  gapThresholdMs = DEFAULT_GAP_THRESHOLD_MS,
  staleAfterMs = DEFAULT_STALE_THRESHOLD_MS,
}: SyncOptions<T>): SyncResult<T> {
  const registerSubscription = useConnectionStore(
    (state) => state.registerSubscription
  );
  const updateSubscription = useConnectionStore(
    (state) => state.updateSubscription
  );
  const markSubscriptionSynced = useConnectionStore(
    (state) => state.markSubscriptionSynced
  );
  const subscription = useConnectionStore((state) => state.subscriptions[key]);
  const lastReconnectAt = useConnectionStore((state) => state.lastReconnectAt);

  const lastItemsRef = useRef<T[]>(items ?? []);
  const lastUpdateKeyRef = useRef<string>("");

  useEffect(() => {
    registerSubscription(key);
  }, [key, registerSubscription]);

  const incomingItems = useMemo(() => {
    if (!items) return undefined;
    return dedupeById(items, getId);
  }, [items, getId]);

  const latestEventTime = useMemo(() => {
    if (!items) {
      return subscription?.lastEventTime ?? 0;
    }
    return (incomingItems ?? []).reduce((latest, item) => {
      const timestamp = getTimestamp(item) ?? 0;
      return Math.max(latest, timestamp);
    }, 0);
  }, [incomingItems, getTimestamp, items, subscription?.lastEventTime]);

  const hasSequenceGap = useMemo(() => {
    if (!getSequence || !items) return false;
    return detectSequenceGap(incomingItems ?? [], getSequence);
  }, [incomingItems, getSequence, items]);

  const hasTimeGap = useMemo(() => {
    if (!items) return false;
    const previousEventTime = subscription?.lastEventTime ?? 0;
    return detectTimeGap(latestEventTime, previousEventTime, gapThresholdMs);
  }, [gapThresholdMs, items, latestEventTime, subscription?.lastEventTime]);

  const computedGap = hasSequenceGap || (subscription?.needsSync && hasTimeGap);
  const now = useMemo(() => Date.now(), [latestEventTime, items]);
  const computedStale =
    latestEventTime > 0 && now - latestEventTime > staleAfterMs;

  const updateKey = useMemo(() => {
    if (!incomingItems) return "";
    return `${incomingItems.length}:${latestEventTime}:${computedGap ? 1 : 0}:${
      computedStale ? 1 : 0
    }`;
  }, [incomingItems, latestEventTime, computedGap, computedStale]);

  useEffect(() => {
    if (!incomingItems) return;
    lastItemsRef.current = incomingItems;
  }, [incomingItems]);

  useEffect(() => {
    if (!items || !incomingItems) return;
    if (updateKey === lastUpdateKeyRef.current) return;
    lastUpdateKeyRef.current = updateKey;

    updateSubscription(key, {
      lastEventTime: latestEventTime,
      lastUpdatedAt: Date.now(),
      hasGap: computedGap,
      isStale: computedStale,
    });

    if (subscription?.needsSync && lastReconnectAt > 0) {
      markSubscriptionSynced(key);
    }
  }, [
    items,
    incomingItems,
    updateKey,
    latestEventTime,
    computedGap,
    computedStale,
    key,
    updateSubscription,
    subscription?.needsSync,
    lastReconnectAt,
    markSubscriptionSynced,
  ]);

  return {
    items: incomingItems ?? lastItemsRef.current,
    latestEventTime,
    hasGap: items ? computedGap : subscription?.hasGap ?? false,
    isStale: items ? computedStale : subscription?.isStale ?? false,
    isSyncing: subscription?.needsSync ?? false,
  };
}
