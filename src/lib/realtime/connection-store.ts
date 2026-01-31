"use client";

import { useConvexConnectionState } from "convex/react";
import type { ConnectionState } from "convex/browser";
import { useEffect } from "react";
import { create } from "zustand";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

type SubscriptionState = {
  lastEventTime: number;
  lastUpdatedAt: number;
  lastSyncedAt: number;
  needsSync: boolean;
  hasGap: boolean;
  isStale: boolean;
};

type ConnectionStore = {
  status: ConnectionStatus;
  state: ConnectionState | null;
  lastUpdated: number;
  lastError?: string;
  lastReconnectAt: number;
  subscriptions: Record<string, SubscriptionState>;
  setConnectionState: (state: ConnectionState) => void;
  setError: (message: string) => void;
  registerSubscription: (key: string) => void;
  updateSubscription: (key: string, update: Partial<SubscriptionState>) => void;
  markSubscriptionSynced: (key: string) => void;
};

function deriveStatus(state: ConnectionState): ConnectionStatus {
  if (state.isWebSocketConnected) {
    return "connected";
  }
  return state.hasEverConnected ? "reconnecting" : "connecting";
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: "connecting",
  state: null,
  lastUpdated: 0,
  lastError: undefined,
  lastReconnectAt: 0,
  subscriptions: {},
  setConnectionState: (state) =>
    set((current) => {
      const nextStatus = deriveStatus(state);
      const shouldSync = current.status === "reconnecting" && nextStatus === "connected";
      const nextSubscriptions = shouldSync
        ? Object.fromEntries(
            Object.entries(current.subscriptions).map(([key, value]) => [
              key,
              { ...value, needsSync: true },
            ])
          )
        : current.subscriptions;

      return {
        state,
        status: nextStatus,
        lastUpdated: Date.now(),
        lastReconnectAt: shouldSync ? Date.now() : current.lastReconnectAt,
        subscriptions: nextSubscriptions,
      };
    }),
  setError: (message) =>
    set({
      lastError: message,
      lastUpdated: Date.now(),
    }),
  registerSubscription: (key) =>
    set((current) => {
      if (current.subscriptions[key]) return current;
      return {
        subscriptions: {
          ...current.subscriptions,
          [key]: {
            lastEventTime: 0,
            lastUpdatedAt: 0,
            lastSyncedAt: 0,
            needsSync: false,
            hasGap: false,
            isStale: false,
          },
        },
      };
    }),
  updateSubscription: (key, update) =>
    set((current) => {
      const existing = current.subscriptions[key];
      if (!existing) return current;
      return {
        subscriptions: {
          ...current.subscriptions,
          [key]: { ...existing, ...update },
        },
      };
    }),
  markSubscriptionSynced: (key) =>
    set((current) => {
      const existing = current.subscriptions[key];
      if (!existing) return current;
      return {
        subscriptions: {
          ...current.subscriptions,
          [key]: {
            ...existing,
            needsSync: false,
            lastSyncedAt: Date.now(),
          },
        },
      };
    }),
}));

export function useConnectionStatus(): ConnectionStatus {
  const connectionState = useConvexConnectionState();
  const setConnectionState = useConnectionStore(
    (state) => state.setConnectionState
  );

  useEffect(() => {
    setConnectionState(connectionState);
  }, [connectionState, setConnectionState]);

  return useConnectionStore((state) => state.status);
}
