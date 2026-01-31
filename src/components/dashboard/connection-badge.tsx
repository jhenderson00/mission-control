"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useConnectionStatus, useConnectionStore } from "@/lib/realtime";
import { AlertTriangle, Loader2 } from "lucide-react";

const DISCONNECTED_THRESHOLD_MS = 15000;

type ConnectionIndicatorStatus =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "disconnected";

function useConnectionIndicator() {
  useConnectionStatus();
  const status = useConnectionStore((state) => state.status);
  const lastUpdated = useConnectionStore((state) => state.lastUpdated);
  const lastError = useConnectionStore((state) => state.lastError);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status === "connected") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [status]);

  const staleDuration = useMemo(() => {
    if (!lastUpdated) return 0;
    return Math.max(0, now - lastUpdated);
  }, [lastUpdated, now]);

  const isDisconnected =
    status !== "connected" && lastUpdated > 0 && staleDuration > DISCONNECTED_THRESHOLD_MS;

  const displayStatus: ConnectionIndicatorStatus = isDisconnected
    ? "disconnected"
    : status;

  return {
    displayStatus,
    isDisconnected,
    staleDuration,
    lastError,
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
  disconnected: {
    label: "Disconnected",
    text: "text-red-300 border-red-500/30",
    dot: "bg-red-400",
  },
};

export function ConnectionBadge({ className }: { className?: string }): JSX.Element {
  const { displayStatus } = useConnectionIndicator();
  const style = statusStyles[displayStatus];
  const isConnecting = displayStatus === "connecting";
  const isReconnecting = displayStatus === "reconnecting";

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-2 border-border/60 bg-background/60 text-[10px] font-semibold uppercase tracking-wide",
        style.text,
        className
      )}
    >
      {isReconnecting ? (
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

export function ConnectionBanner(): JSX.Element | null {
  const { isDisconnected, staleDuration, lastError } = useConnectionIndicator();

  if (!isDisconnected) return null;

  const seconds = Math.round(staleDuration / 1000);
  const detail = lastError
    ? `Last error: ${lastError}`
    : `Connection lost. Reconnecting for ${seconds}s.`;

  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 text-red-300" />
      <div>
        <p className="font-semibold text-red-200">Connection disrupted</p>
        <p className="text-xs text-red-200/80">{detail}</p>
      </div>
    </div>
  );
}
