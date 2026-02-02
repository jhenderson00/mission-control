import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { render, screen } from "@testing-library/react";
import {
  ConnectionBadge,
  ConnectionBanner,
} from "@/components/dashboard/connection-badge";
import { PendingOperations } from "@/components/agents/pending-operations";
import { useConnectionStore } from "@/lib/realtime";
import type { OperationEntry } from "@/lib/controls/optimistic-operations";

vi.mock("@/lib/realtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/realtime")>(
    "@/lib/realtime"
  );
  return {
    ...actual,
    useConnectionStatus: () => actual.useConnectionStore.getState().status,
  };
});

const resetConnectionStore = () => {
  useConnectionStore.setState({
    status: "connecting",
    state: null,
    lastUpdated: 0,
    lastError: undefined,
    lastReconnectAt: 0,
    subscriptions: {},
  });
};

describe("CYD-133 UAT - Edge Cases", () => {
  beforeEach(() => {
    resetConnectionStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows disconnect banner after network loss", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    act(() => {
      useConnectionStore.setState({
        status: "reconnecting",
        lastUpdated: now.getTime() - 20000,
        lastError: "Socket closed",
      });
    });

    render(<ConnectionBanner />);

    expect(screen.getByText("Connection disrupted")).toBeInTheDocument();
    expect(screen.getByText(/Socket closed/)).toBeInTheDocument();

  });

  it("shows syncing badge after reconnect", () => {
    act(() => {
      useConnectionStore.setState({
        status: "connected",
        lastUpdated: Date.now(),
        subscriptions: {
          "activity-feed": {
            lastEventTime: 100,
            lastUpdatedAt: 100,
            lastSyncedAt: 0,
            needsSync: true,
            hasGap: false,
            isStale: false,
          },
        },
      });
    });

    render(<ConnectionBadge />);

    expect(screen.getByText("Syncing")).toBeInTheDocument();
  });

  it("renders failed operation details in the pending list", () => {
    const operations: OperationEntry[] = [
      {
        operationId: "op_failed",
        agentId: "agent_9",
        command: "agent.resume",
        status: "failed",
        requestedAt: 100,
        requestedBy: "operator",
        error: "Bridge timeout",
        isOptimistic: true,
      },
    ];

    render(<PendingOperations operations={operations} isLoading={false} />);

    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Bridge timeout")).toBeInTheDocument();
  });
});
