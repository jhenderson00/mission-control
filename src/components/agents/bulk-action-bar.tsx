"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import type { AgentSummary } from "@/lib/agent-types";
import type { OperationStatus } from "@/lib/controls/operation-status";
import {
  createRequestId,
  useOptimisticOperationsStore,
} from "@/lib/controls/optimistic-operations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OperationStatusBadge } from "@/components/agents/operation-status-badge";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Pause,
  PlayCircle,
  ShieldAlert,
  TimerOff,
} from "lucide-react";

const priorities = ["low", "medium", "high", "critical"] as const;

type Priority = (typeof priorities)[number];

type BulkAction = "pause" | "resume" | "priority" | "kill";

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
const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

const isOperationStatus = (status: BulkStatus): status is OperationStatus =>
  status !== "pending" && status !== "ready";

export function BulkActionBar({
  selectedAgents,
  onClearSelection,
}: BulkActionBarProps): React.ReactElement | null {
  const bulkDispatch = hasControlsApi ? useAction(api.controls.bulkDispatch) : null;
  const addOptimisticOperations = useOptimisticOperationsStore(
    (state) => state.addOperations
  );
  const updateOptimisticOperations = useOptimisticOperationsStore(
    (state) => state.updateOperations
  );
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [killConfirmation, setKillConfirmation] = useState("");
  const [status, setStatus] = useState<DispatchStatus | null>(null);
  const [priority, setPriority] = useState<Priority | "">("");
  const [results, setResults] = useState<Record<string, BulkResult>>({});
  const [lastAction, setLastAction] = useState<BulkAction | null>(null);
  const [lastParams, setLastParams] = useState<Record<string, unknown> | null>(null);
  const [activeBulkId, setActiveBulkId] = useState<string | null>(null);

  const bulkOperations = useQuery(
    api.controls.listByBulkId,
    !hasConvex || !activeBulkId ? "skip" : { bulkId: activeBulkId }
  );

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

  const isBlocked = pendingAction !== null || !bulkDispatch;
  const bulkKillCopy = useMemo(() => {
    if (selectedAgents.length === 1) {
      const name = selectedAgents[0]?.name?.trim() || "this agent";
      const phrase = `KILL ${name}`;
      return { phrase, hint: `${phrase} or CONFIRM` };
    }
    const phrase = `KILL ${selectedAgents.length} AGENTS`;
    return { phrase, hint: `${phrase} or CONFIRM` };
  }, [selectedAgents]);
  const killConfirmed = useMemo(() => {
    const normalized = killConfirmation.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    if (normalized === "confirm") {
      return true;
    }
    return normalized === bulkKillCopy.phrase.toLowerCase();
  }, [bulkKillCopy.phrase, killConfirmation]);

  const setPendingForAgents = (agentIds: string[]) => {
    setResults((prev) => {
      const next = { ...prev };
      for (const agentId of agentIds) {
        next[agentId] = { status: "pending" };
      }
      return next;
    });
  };

  useEffect(() => {
    if (!bulkOperations || bulkOperations.length === 0) {
      return;
    }
    setResults((prev) => {
      const next = { ...prev };
      for (const operation of bulkOperations) {
        next[operation.agentId] = {
          status: operation.status as BulkStatus,
          error: operation.error ?? prev[operation.agentId]?.error,
        };
      }
      return next;
    });

    updateOptimisticOperations(
      Object.fromEntries(
        bulkOperations.map((operation) => [
          operation.operationId,
          {
            status: operation.status as OperationStatus,
            error: operation.error ?? undefined,
          },
        ])
      )
    );
  }, [bulkOperations, updateOptimisticOperations]);

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
  ): Promise<boolean> => {
    if (agentIds.length === 0) {
      return false;
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
      return false;
    }

    const requestId = createRequestId();
    const requestedAt = Date.now();
    const optimisticOperations = agentIds.map((agentId) => ({
      operationId: `${requestId}:${agentId}`,
      agentId,
      command: actionCommandMap[action],
      params,
      status: "queued" as const,
      requestedAt,
      requestedBy: "you",
      isOptimistic: true as const,
    }));
    addOptimisticOperations(optimisticOperations);
    updateOptimisticOperations(
      Object.fromEntries(
        optimisticOperations.map((operation) => [
          operation.operationId,
          { status: "sent" as const },
        ])
      )
    );

    setPendingAction(action);
    setStatus({ tone: "pending", message: "Dispatching bulk command..." });
    setPendingForAgents(agentIds);
    setLastAction(action);
    setLastParams(params ?? null);
    setActiveBulkId(requestId);

    let ok = false;
    try {
      const payload: {
        agentIds: string[];
        command: "agent.pause" | "agent.resume" | "agent.priority.override" | "agent.kill";
        params?: Record<string, unknown>;
        requestId?: string;
      } = {
        agentIds,
        command: actionCommandMap[action],
        requestId,
      };

      if (params) {
        payload.params = params;
      }

      const response = await bulkDispatch(payload);
      ok = response.ok;
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
      if (response.operations.length > 0) {
        updateOptimisticOperations(
          Object.fromEntries(
            response.operations.map((operation: { agentId: string; operationId: string; status: string }) => [
              operation.operationId,
              {
                status: operation.status,
                error: response.ok ? undefined : response.error,
              },
            ])
          )
        );
      } else {
        updateOptimisticOperations(
          Object.fromEntries(
            optimisticOperations.map((operation) => [
              operation.operationId,
              {
                status: "failed" as const,
                error: response.error ?? "Bulk command rejected by bridge.",
              },
            ])
          )
        );
      }
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
      updateOptimisticOperations(
        Object.fromEntries(
          optimisticOperations.map((operation) => [
            operation.operationId,
            { status: "failed" as const, error: message },
          ])
        )
      );
      ok = false;
    } finally {
      setPendingAction(null);
    }
    return ok;
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

  const handleKill = () => {
    if (isBlocked) {
      return;
    }
    setKillConfirmation("");
    setIsConfirmOpen(true);
  };

  const handleConfirmKill = async () => {
    if (!killConfirmed) {
      return;
    }
    const ok = await handleBulkDispatch("kill", selectedIds);
    if (ok) {
      setIsConfirmOpen(false);
      setKillConfirmation("");
    }
  };

  const handleRetryFailed = async () => {
    if (!lastAction || failedAgentIds.length === 0) {
      return;
    }
    await handleBulkDispatch(lastAction, failedAgentIds, lastParams ?? undefined);
  };

  useEffect(() => {
    if (selectedAgents.length === 0 && isConfirmOpen) {
      setIsConfirmOpen(false);
    }
  }, [isConfirmOpen, selectedAgents.length]);

  useEffect(() => {
    setKillConfirmation("");
  }, [selectedAgents]);

  useEffect(() => {
    if (selectedAgents.length === 0) {
      return;
    }

    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tag = target.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isTypingTarget(event.target)) {
        return;
      }

      if (isConfirmOpen) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "p") {
        event.preventDefault();
        if (!isBlocked) {
          void handleBulkDispatch("pause", selectedIds);
        }
        return;
      }

      if (key === "r") {
        event.preventDefault();
        if (!isBlocked) {
          void handleBulkDispatch("resume", selectedIds);
        }
        return;
      }

      if (key === "k") {
        event.preventDefault();
        if (!isBlocked) {
          setIsConfirmOpen(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleBulkDispatch, isBlocked, isConfirmOpen, selectedAgents.length, selectedIds]);

  if (selectedAgents.length === 0) {
    return null;
  }

  const isKillPending = pendingAction === "kill";

  return (
    <div className="sticky bottom-4 z-30">
      <Dialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          if (isKillPending) {
            return;
          }
          setIsConfirmOpen(open);
          if (!open) {
            setKillConfirmation("");
          }
        }}
      >
        <DialogContent
          className="max-w-md"
          onEscapeKeyDown={(event) => {
            if (isKillPending) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (isKillPending) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Confirm kill</DialogTitle>
            <DialogDescription>
              This will terminate {selectedAgents.length} agent session
              {selectedAgents.length === 1 ? "" : "s"} and stop any active work.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-background/60 p-3">
              <p className="text-xs text-muted-foreground mb-2">
                Agents affected
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedAgents.slice(0, 6).map((agent) => (
                  <Badge key={agent._id} variant="outline" className="text-[10px]">
                    {agent.name}
                  </Badge>
                ))}
                {selectedAgents.length > 6 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{selectedAgents.length - 6} more
                  </Badge>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3">
              <p className="text-xs font-semibold text-destructive">
                Immediate termination
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Killing these sessions interrupts active work and cannot be
                undone.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Type {bulkKillCopy.hint} to proceed.
              </p>
              <Input
                placeholder={`Type ${bulkKillCopy.hint}`}
                value={killConfirmation}
                onChange={(event) => setKillConfirmation(event.target.value)}
                disabled={isBlocked}
              />
            </div>
          </div>
          {isKillPending && (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Awaiting bridge confirmation...
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isKillPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmKill}
              disabled={!killConfirmed || isBlocked}
            >
              {isKillPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Killing...
                </>
              ) : (
                "Kill agents"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
                <span
                  className="ml-2 hidden items-center rounded border border-border/60 px-1 text-[10px] text-muted-foreground sm:inline-flex"
                  aria-hidden="true"
                >
                  P
                </span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleResume} disabled={isBlocked}>
                <PlayCircle className="mr-2 h-4 w-4" />
                {pendingAction === "resume" ? "Resuming..." : "Resume"}
                <span
                  className="ml-2 hidden items-center rounded border border-border/60 px-1 text-[10px] text-muted-foreground sm:inline-flex"
                  aria-hidden="true"
                >
                  R
                </span>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleKill}
                disabled={isBlocked}
              >
                <ShieldAlert className="mr-2 h-4 w-4" />
                {pendingAction === "kill" ? "Killing..." : "Kill"}
                <span
                  className="ml-2 hidden items-center rounded border border-border/60 px-1 text-[10px] text-muted-foreground sm:inline-flex"
                  aria-hidden="true"
                >
                  K
                </span>
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
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span>Shortcuts:</span>
            <span>P Pause</span>
            <span>R Resume</span>
            <span>K Kill</span>
            <span>Esc Clear</span>
            <span>Cmd/Ctrl+A Select all</span>
          </div>

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
                    {isOperationStatus(result.status) ? (
                      <OperationStatusBadge status={result.status} />
                    ) : (
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", statusMeta.className)}
                      >
                        {statusLabels[result.status]}
                      </Badge>
                    )}
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
