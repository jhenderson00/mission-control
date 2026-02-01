"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import type { AgentSummary } from "@/lib/agent-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Pause,
  PlayCircle,
  ShieldAlert,
  TimerOff,
} from "lucide-react";

const priorities = ["low", "medium", "high", "critical"] as const;

type Priority = (typeof priorities)[number];

type BulkAction = "pause" | "resume" | "priority" | "kill";

type OperationStatus = "queued" | "sent" | "acked" | "failed" | "timed-out";

type BulkStatus = OperationStatus | "pending" | "ready";

type BulkResult = {
  status: BulkStatus;
  error?: string;
};

type DispatchStatus = {
  tone: "success" | "error" | "pending";
  message: string;
};

type BulkActionBarProps = {
  selectedAgents: AgentSummary[];
  onClearSelection: () => void;
};

const actionCommandMap: Record<BulkAction, "agent.pause" | "agent.resume" | "agent.priority.override" | "agent.kill"> = {
  pause: "agent.pause",
  resume: "agent.resume",
  priority: "agent.priority.override",
  kill: "agent.kill",
};

const statusLabels: Record<BulkStatus, string> = {
  ready: "Ready",
  pending: "Dispatching",
  queued: "Queued",
  sent: "Sent",
  acked: "Acked",
  failed: "Failed",
  "timed-out": "Timed out",
};

const statusStyles: Record<BulkStatus, { icon: typeof CheckCircle2; className: string }> = {
  ready: { icon: Clock, className: "text-muted-foreground" },
  pending: { icon: Clock, className: "text-amber-300" },
  queued: { icon: Clock, className: "text-amber-300" },
  sent: { icon: Clock, className: "text-amber-300" },
  acked: { icon: CheckCircle2, className: "text-emerald-400" },
  failed: { icon: AlertTriangle, className: "text-red-400" },
  "timed-out": { icon: TimerOff, className: "text-red-400" },
};

const hasControlsApi = typeof api.controls?.bulkDispatch !== "undefined";

export function BulkActionBar({
  selectedAgents,
  onClearSelection,
}: BulkActionBarProps): React.ReactElement | null {
  const bulkDispatch = hasControlsApi ? useAction(api.controls.bulkDispatch) : null;
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);
  const [status, setStatus] = useState<DispatchStatus | null>(null);
  const [priority, setPriority] = useState<Priority | "">("");
  const [results, setResults] = useState<Record<string, BulkResult>>({});
  const [lastAction, setLastAction] = useState<BulkAction | null>(null);
  const [lastParams, setLastParams] = useState<Record<string, unknown> | null>(null);

  const selectedIds = useMemo(
    () => selectedAgents.map((agent) => agent._id),
    [selectedAgents]
  );

  useEffect(() => {
    setResults((prev) => {
      const next: Record<string, BulkResult> = {};
      for (const agent of selectedAgents) {
        next[agent._id] = prev[agent._id] ?? { status: "ready" };
      }
      return next;
    });
  }, [selectedAgents]);

  const failedAgentIds = useMemo(
    () =>
      selectedAgents
        .map((agent) => agent._id)
        .filter((agentId) => {
          const status = results[agentId]?.status;
          return status === "failed" || status === "timed-out";
        }),
    [results, selectedAgents]
  );

  if (selectedAgents.length === 0) {
    return null;
  }

  const isBlocked = pendingAction !== null || !bulkDispatch;

  const setPendingForAgents = (agentIds: string[]) => {
    setResults((prev) => {
      const next = { ...prev };
      for (const agentId of agentIds) {
        next[agentId] = { status: "pending" };
      }
      return next;
    });
  };

  const applyResults = (
    agentIds: string[],
    operationStatuses: Array<{ agentId: string; status: OperationStatus }>
  ) => {
    const statusMap = new Map(
      operationStatuses.map((operation) => [operation.agentId, operation.status])
    );
    setResults((prev) => {
      const next = { ...prev };
      for (const agentId of agentIds) {
        const statusValue = statusMap.get(agentId) ?? "failed";
        next[agentId] = { status: statusValue };
      }
      return next;
    });
  };

  const handleBulkDispatch = async (
    action: BulkAction,
    agentIds: string[],
    params?: Record<string, unknown>
  ) => {
    if (agentIds.length === 0) {
      return;
    }

    if (!bulkDispatch) {
      setStatus({
        tone: "error",
        message: "Controls API not deployed yet. Deploy Convex to enable.",
      });
      setResults((prev) => {
        const next = { ...prev };
        for (const agentId of agentIds) {
          next[agentId] = { status: "failed", error: "Controls unavailable" };
        }
        return next;
      });
      return;
    }

    setPendingAction(action);
    setStatus({ tone: "pending", message: "Dispatching bulk command..." });
    setPendingForAgents(agentIds);
    setLastAction(action);
    setLastParams(params ?? null);

    try {
      const payload: {
        agentIds: string[];
        command: "agent.pause" | "agent.resume" | "agent.priority.override" | "agent.kill";
        params?: Record<string, unknown>;
      } = {
        agentIds,
        command: actionCommandMap[action],
      };

      if (params) {
        payload.params = params;
      }

      const response = await bulkDispatch(payload);
      if (response.ok) {
        setStatus({
          tone: "success",
          message: `Bulk ${action} acknowledged (${response.operations.length}).`,
        });
      } else {
        setStatus({
          tone: "error",
          message: response.error ?? "Bulk command rejected by bridge.",
        });
      }

      applyResults(agentIds, response.operations);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bulk command failed";
      setStatus({ tone: "error", message });
      setResults((prev) => {
        const next = { ...prev };
        for (const agentId of agentIds) {
          next[agentId] = { status: "failed", error: message };
        }
        return next;
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handlePause = async () => {
    await handleBulkDispatch("pause", selectedIds);
  };

  const handleResume = async () => {
    await handleBulkDispatch("resume", selectedIds);
  };

  const handlePriorityOverride = async () => {
    if (!priority) {
      setStatus({ tone: "error", message: "Select a priority to override." });
      return;
    }
    await handleBulkDispatch("priority", selectedIds, { priority });
  };

  const handleKill = async () => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Kill ${selectedAgents.length} agent session${selectedAgents.length === 1 ? "" : "s"}?`
      );
      if (!confirmed) {
        return;
      }
    }
    await handleBulkDispatch("kill", selectedIds);
  };

  const handleRetryFailed = async () => {
    if (!lastAction || failedAgentIds.length === 0) {
      return;
    }
    await handleBulkDispatch(lastAction, failedAgentIds, lastParams ?? undefined);
  };

  return (
    <div className="sticky bottom-4 z-30">
      <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-lg shadow-lg shadow-black/20">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Bulk actions</p>
              <p className="text-xs text-muted-foreground">
                {selectedAgents.length} agent{selectedAgents.length === 1 ? "" : "s"} selected
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePause} disabled={isBlocked}>
                <Pause className="mr-2 h-4 w-4" />
                {pendingAction === "pause" ? "Pausing..." : "Pause"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleResume} disabled={isBlocked}>
                <PlayCircle className="mr-2 h-4 w-4" />
                {pendingAction === "resume" ? "Resuming..." : "Resume"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleKill}
                disabled={isBlocked}
              >
                <ShieldAlert className="mr-2 h-4 w-4" />
                {pendingAction === "kill" ? "Killing..." : "Kill"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                disabled={isBlocked}
              >
                Clear
              </Button>
            </div>
          </div>

          {status && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge
                variant={
                  status.tone === "success"
                    ? "secondary"
                    : status.tone === "pending"
                      ? "outline"
                      : "destructive"
                }
              >
                {status.tone}
              </Badge>
              <span>{status.message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {priorities.map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={priority === value ? "secondary" : "outline"}
                  onClick={() => setPriority(value)}
                  disabled={isBlocked}
                >
                  {value}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={handlePriorityOverride}
                disabled={isBlocked}
              >
                Override priority
              </Button>
              {failedAgentIds.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRetryFailed}
                  disabled={isBlocked}
                >
                  Retry failed ({failedAgentIds.length})
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="max-h-40 rounded-xl border border-border/60 bg-background/40">
            <div className="divide-y divide-border/50">
              {selectedAgents.map((agent) => {
                const result = results[agent._id] ?? { status: "ready" };
                const statusMeta = statusStyles[result.status];
                const StatusIcon = statusMeta.icon;
                return (
                  <div
                    key={agent._id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <StatusIcon className={cn("h-3.5 w-3.5", statusMeta.className)} />
                      <span className="text-foreground">{agent.name}</span>
                    </div>
                    <Badge variant="outline" className={cn("text-[10px]", statusMeta.className)}>
                      {statusLabels[result.status]}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
