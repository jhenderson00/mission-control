"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type HeartbeatStatus = "online" | "offline" | "busy" | "paused";

type HeartbeatIndicatorProps = {
  status?: HeartbeatStatus;
  className?: string;
};

const heartbeatStyles: Record<HeartbeatStatus, { label: string; dot: string; text: string }> = {
  online: {
    label: "Online",
    dot: "bg-emerald-400",
    text: "text-emerald-300 border-emerald-500/30",
  },
  busy: {
    label: "Busy",
    dot: "bg-amber-400",
    text: "text-amber-300 border-amber-500/30",
  },
  paused: {
    label: "Paused",
    dot: "bg-zinc-400",
    text: "text-zinc-300 border-zinc-500/30",
  },
  offline: {
    label: "Offline",
    dot: "bg-red-400",
    text: "text-red-300 border-red-500/30",
  },
};

export function HeartbeatIndicator({
  status = "offline",
  className,
}: HeartbeatIndicatorProps): React.ReactElement {
  const style = heartbeatStyles[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-border/60 bg-background/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        style.text,
        className
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", style.dot)} />
      {style.label}
    </Badge>
  );
}
