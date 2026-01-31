"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useConnectionStatus, useConnectionStore } from "@/lib/realtime";
import { formatRelativeTime } from "@/lib/format";
import { AlertTriangle, Loader2 } from "lucide-react";

const DISCONNECTED_THRESHOLD_MS = 15000;

type ConnectionIndicatorStatus =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "syncing"
  | "disconnected";

function useConnectionIndicator() {
  useConnectionStatus();
  const status = useConnectionStore((state) => state.status);
  const lastUpdated = useConnectionStore((state) => state.lastUpdated);
  const lastError = useConnectionStore((state) => state.lastError);
  const subscriptions = useConnectionStore((state) => state.subscriptions);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const shouldTick =
      status !== "connected" || Object.values(subscriptions).some((sub) => sub.isStale);
    if (!shouldTick) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [status, subscriptions]);

  const staleDuration = useMemo(() => {
    if (!lastUpdated) return 0;
    return Math.max(0, now - lastUpdated);
  }, [lastUpdated, now]);

  const isDisconnected =
    status !== "connected" && lastUpdated > 0 && staleDuration > DISCONNECTED_THRESHOLD_MS;

  const isSyncing = Object.values(subscriptions).some((sub) => sub.needsSync);
  const hasStale = Object.values(subscriptions).some((sub) => sub.isStale);
  const latestEventTime = useMemo(() => {
    const times = Object.values(subscriptions).map((sub) => sub.lastEventTime);
    return times.length > 0 ? Math.max(...times) : 0;
  }, [subscriptions]);

  const displayStatus: ConnectionIndicatorStatus = isDisconnected
    ? "disconnected"
    : isSyncing && status === "connected"
      ? "syncing"
    : status;

  return {
    displayStatus,
    isDisconnected,
    staleDuration,
    lastError,
    hasStale,
    latestEventTime,
  };
}

const statusStyles: Record<
  ConnectionIndicatorStatus,
  { label: string; text: string; dot: string }
> = {
  connected: {
    label: "Connected",
    text: "text-emerald-300 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  connecting: {
    label: "Connecting",
    text: "text-amber-300 border-amber-500/30",
    dot: "bg-amber-400",
  },
  reconnecting: {
    label: "Reconnecting",
    text: "text-amber-300 border-amber-500/30",
    dot: "bg-amber-400",
  },
  syncing: {
    label: "Syncing",
    text: "text-sky-300 border-sky-500/30",
    dot: "bg-sky-400",
  },
  disconnected: {
    label: "Disconnected",
    text: "text-red-300 border-red-500/30",
    dot: "bg-red-400",
  },
};

export function ConnectionBadge({ className }: { className?: string }): React.ReactElement {
  const { displayStatus } = useConnectionIndicator();
  const style = statusStyles[displayStatus];
  const isConnecting = displayStatus === "connecting";
  const isReconnecting = displayStatus === "reconnecting";
  const isSyncing = displayStatus === "syncing";

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-2 border-border/60 bg-background/60 text-[10px] font-semibold uppercase tracking-wide",
        style.text,
        className
      )}
    >
      {isReconnecting || isSyncing ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            style.dot,
            isConnecting && "animate-pulse"
          )}
        />
      )}
      {style.label}
    </Badge>
  );
}

export function ConnectionBanner(): React.ReactElement | null {
  const {
    isDisconnected,
    staleDuration,
    lastError,
    hasStale,
    latestEventTime,
  } = useConnectionIndicator();

  if (!isDisconnected && !hasStale) return null;

  const seconds = Math.round(staleDuration / 1000);
  const staleLabel = latestEventTime
    ? `Last update ${formatRelativeTime(latestEventTime, "just now")}.`
    : "Waiting for new data from the gateway.";
  const detail = isDisconnected
    ? lastError
      ? `Last error: ${lastError}`
      : `Connection lost. Reconnecting for ${seconds}s.`
    : `Data may be stale. ${staleLabel}`;

  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 text-red-300" />
      <div>
        <p className="font-semibold text-red-200">
          {isDisconnected ? "Connection disrupted" : "Data freshness warning"}
        </p>
        <p className="text-xs text-red-200/80">{detail}</p>
      </div>
    </div>
  );
}
