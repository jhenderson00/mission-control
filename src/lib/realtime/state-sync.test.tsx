import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import type { ConnectionState } from "convex/browser";
import {
  dedupeById,
  detectSequenceGap,
  detectTimeGap,
  useStateSync,
} from "@/lib/realtime/state-sync";
import { useConnectionStore } from "@/lib/realtime/connection-store";

type TestEvent = {
  id: string;
  timestamp: number;
  sequence: number;
};

function SyncProbe({ items }: { items: TestEvent[] | undefined }) {
  const sync = useStateSync<TestEvent>({
    key: "test-stream",
    items,
    getId: (event) => event.id,
    getTimestamp: (event) => event.timestamp,
    getSequence: (event) => event.sequence,
    gapThresholdMs: 1000,
    staleAfterMs: 5000,
  });

  return (
    <div
      data-testid="sync"
      data-syncing={String(sync.isSyncing)}
      data-gap={String(sync.hasGap)}
      data-count={String(sync.items.length)}
    />
  );
}

function resetConnectionStore() {
  useConnectionStore.setState({
    status: "connecting",
    state: null,
    lastUpdated: 0,
    lastError: undefined,
    lastReconnectAt: 0,
    subscriptions: {},
  });
}

const connectedState = {
  isWebSocketConnected: true,
  hasEverConnected: true,
  isWebSocketAuthenticated: true,
} as ConnectionState;

const disconnectedState = {
  isWebSocketConnected: false,
  hasEverConnected: true,
  isWebSocketAuthenticated: false,
} as ConnectionState;

describe("state-sync", () => {
  beforeEach(() => {
    resetConnectionStore();
  });

  it("deduplicates events by id", () => {
    const items = [
      { id: "event-1", timestamp: 1000, sequence: 1 },
      { id: "event-1", timestamp: 1100, sequence: 1 },
      { id: "event-2", timestamp: 1200, sequence: 2 },
    ];
    const deduped = dedupeById(items, (item) => item.id);
    expect(deduped).toHaveLength(2);
    expect(deduped[0].timestamp).toBe(1000);
  });

  it("detects sequence and time gaps", () => {
    const items = [
      { id: "event-1", timestamp: 1000, sequence: 1 },
      { id: "event-2", timestamp: 2000, sequence: 3 },
    ];
    expect(detectSequenceGap(items, (item) => item.sequence)).toBe(true);
    expect(detectTimeGap(4000, 1000, 2000)).toBe(true);
  });

  it("flags syncing after reconnect until new data arrives", async () => {
    act(() => {
      useConnectionStore.getState().setConnectionState(connectedState);
    });

    const initialItems = [
      { id: "event-1", timestamp: 1000, sequence: 1 },
    ];
    const { rerender } = render(<SyncProbe items={initialItems} />);

    expect(screen.getByTestId("sync")).toHaveAttribute("data-syncing", "false");

    act(() => {
      useConnectionStore.getState().setConnectionState(disconnectedState);
      useConnectionStore.getState().setConnectionState(connectedState);
    });

    await waitFor(() => {
      expect(screen.getByTestId("sync")).toHaveAttribute("data-syncing", "true");
    });

    const updatedItems = [
      { id: "event-1", timestamp: 1000, sequence: 1 },
      { id: "event-2", timestamp: 2000, sequence: 2 },
    ];
    rerender(<SyncProbe items={updatedItems} />);

    await waitFor(() => {
      expect(screen.getByTestId("sync")).toHaveAttribute("data-syncing", "false");
    });
  });
});
