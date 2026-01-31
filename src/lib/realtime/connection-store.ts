"use client";

import { useConvexConnectionState } from "convex/react";
import type { ConnectionState } from "convex/browser";
import { useEffect } from "react";
import { create } from "zustand";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

type ConnectionStore = {
  status: ConnectionStatus;
  state: ConnectionState | null;
  lastUpdated: number;
  lastError?: string;
  setConnectionState: (state: ConnectionState) => void;
  setError: (message: string) => void;
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
  setConnectionState: (state) =>
    set({
      state,
      status: deriveStatus(state),
      lastUpdated: Date.now(),
    }),
  setError: (message) =>
    set({
      lastError: message,
      lastUpdated: Date.now(),
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
