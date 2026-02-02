"use client";

import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActivityEvent } from "@/lib/realtime";

const typeTone: Record<string, string> = {
  agent: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  chat: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  presence: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
  health: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  heartbeat: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  tool_call: "border-orange-500/30 bg-orange-500/10 text-orange-200",
  tool_result: "border-lime-500/30 bg-lime-500/10 text-lime-200",
  thinking: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  error: "border-red-500/30 bg-red-500/10 text-red-200",
  token_usage: "border-teal-500/30 bg-teal-500/10 text-teal-200",
};

const diagnosticToneBySeverity: Record<string, string> = {
  error: "border-red-500/30 bg-red-500/10 text-red-200",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-200",
};

function formatEventType(eventType: string): string {
  return eventType
    .replace(/[_\.]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAgentLabel(agentId: string): string {
  if (agentId.length <= 12) return agentId;
  return `${agentId.slice(0, 6)}…${agentId.slice(-4)}`;
}

function resolveTone(eventType: string): string {
  const direct = typeTone[eventType];
  if (direct) {
    return direct;
  }
  if (eventType.startsWith("diagnostic")) {
    if (eventType.includes("error")) {
      return diagnosticToneBySeverity.error;
    }
    if (eventType.includes("warn")) {
      return diagnosticToneBySeverity.warning;
    }
    if (eventType.includes("info")) {
      return diagnosticToneBySeverity.info;
    }
    return "border-violet-500/30 bg-violet-500/10 text-violet-200";
  }
  return "border-border/60 bg-muted/40 text-muted-foreground";
}

type ActivityItemProps = {
  event: ActivityEvent;
};

export function ActivityItem({ event }: ActivityItemProps): React.ReactElement {
  const timeLabel = formatRelativeTime(event.createdAt, "just now");
  const typeLabel = formatEventType(event.type);
  const tone = resolveTone(event.type);
  const agentLabel = formatAgentLabel(event.agentId);

  return (
    <div className="rounded-xl border border-border/60 bg-background/50 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn("uppercase tracking-wide", tone)}>
            {typeLabel}
          </Badge>
          <Badge
            variant="outline"
            className="border-border/60 bg-card/40 text-xs text-muted-foreground"
            title={event.agentId}
          >
            {agentLabel}
          </Badge>
        </div>
        <span
          className="text-xs text-muted-foreground tabular-nums"
          title={new Date(event.createdAt).toLocaleString()}
        >
          {timeLabel}
        </span>
      </div>
      <p className="mt-3 text-sm text-foreground">{event.content}</p>
    </div>
  );
}
