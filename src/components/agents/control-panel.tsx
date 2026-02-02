"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { OperationStatus } from "@/lib/controls/operation-status";
import {
  createRequestId,
  useOptimisticOperationsStore,
} from "@/lib/controls/optimistic-operations";
import { RedirectDialog, type RedirectPayload } from "@/components/agents/redirect-dialog";
import { priorityOptions, type Priority } from "@/components/agents/priority";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Flame,
  Loader2,
  Pause,
  PlayCircle,
  RefreshCw,
  Siren,
} from "lucide-react";

type ControlPanelProps = {
  agentId: string;
  agentName?: string;
  agentStatus?: string;
  currentTaskTitle?: string | null;
  disabled?: boolean;
};

type DispatchStatus = {
  tone: "success" | "error" | "pending";
  message: string;
};

// Check if controls API is available (Convex may not have it deployed yet)
const hasControlsApi = typeof api.controls?.dispatch !== "undefined";

export function ControlPanel({
  agentId,
  agentName,
  agentStatus,
  currentTaskTitle,
  disabled = false,
}: ControlPanelProps): React.ReactElement {
  // Only call useAction if the API exists to avoid crashes
  const dispatch = hasControlsApi ? useAction(api.controls.dispatch) : null;
  const addOptimisticOperation = useOptimisticOperationsStore(
    (state) => state.addOperation
  );
  const updateOptimisticOperation = useOptimisticOperationsStore(
    (state) => state.updateOperation
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [status, setStatus] = useState<DispatchStatus | null>(null);

  const [pauseReason, setPauseReason] = useState("");
  const [overridePriority, setOverridePriority] = useState<Priority | "">("");
  const [overrideDuration, setOverrideDuration] = useState("");
  const [sessionKey, setSessionKey] = useState("");
  const [killDialogOpen, setKillDialogOpen] = useState(false);
  const [restartDialogOpen, setRestartDialogOpen] = useState(false);
  const [killConfirmation, setKillConfirmation] = useState("");
  const [restartConfirmation, setRestartConfirmation] = useState("");

  const trimmedAgentName = agentName?.trim();
  const agentDisplayName = trimmedAgentName ?? agentId;

  const buildConfirmationCopy = (action: "kill" | "restart") => {
    const actionLabel = action === "kill" ? "KILL" : "RESTART";
    const phrase = trimmedAgentName ? `${actionLabel} ${trimmedAgentName}` : actionLabel;
    return {
      actionLabel,
      phrase,
      hint: `${phrase} or CONFIRM`,
    };
  };

  const isConfirmationValid = (action: "kill" | "restart", value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    if (normalized === "confirm") {
      return true;
    }
    const actionLabel = action === "kill" ? "kill" : "restart";
    if (normalized === actionLabel) {
      return true;
    }
    if (trimmedAgentName) {
      return normalized === `${actionLabel} ${trimmedAgentName.toLowerCase()}`;
    }
    return false;
  };

  const killConfirmationCopy = buildConfirmationCopy("kill");
  const restartConfirmationCopy = buildConfirmationCopy("restart");

  const killConfirmed = isConfirmationValid("kill", killConfirmation);
  const restartConfirmed = isConfirmationValid("restart", restartConfirmation);

  const isBlocked = disabled || !dispatch || pendingAction !== null;
  const displayedStatus =
    status ??
    (disabled
      ? {
          tone: "error",
          message: "Controls are unavailable without a Convex connection.",
        }
      : !dispatch
        ? {
            tone: "error",
            message: "Controls API not deployed yet. Deploy Convex to enable.",
          }
        : null);

  const runCommand = async (
    actionKey: string,
    command: "agent.pause" | "agent.resume" | "agent.redirect" | "agent.priority.override" | "agent.kill" | "agent.restart",
    params?: Record<string, unknown>
  ): Promise<boolean> => {
    if (disabled || !dispatch) {
      setStatus({
        tone: "error",
        message: disabled
          ? "Controls are unavailable without a Convex connection."
          : "Controls API not deployed yet.",
      });
      return false;
    }

    const requestId = createRequestId();
    const requestedAt = Date.now();
    addOptimisticOperation({
      operationId: requestId,
      agentId,
      command,
      params,
      status: "queued",
      requestedAt,
      requestedBy: "you",
      isOptimistic: true,
    });
    updateOptimisticOperation(requestId, { status: "sent" });

    setPendingAction(actionKey);
    setStatus({ tone: "pending", message: "Dispatching control command..." });

    let ok = false;
    try {
      const response = await dispatch({
        agentId,
        command,
        params,
        requestId,
      });

      const nextStatus = response.status as OperationStatus;
      updateOptimisticOperation(requestId, {
        status: nextStatus,
        error: response.ok ? undefined : response.error,
      });
      ok = response.ok;

      if (response.ok) {
        setStatus({
          tone: "success",
          message: `Acknowledged (${response.status}).`,
        });
      } else {
        setStatus({
          tone: "error",
          message: response.error ?? "Command rejected by bridge.",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Command failed";
      updateOptimisticOperation(requestId, {
        status: "failed",
        error: message,
      });
      setStatus({ tone: "error", message });
    } finally {
      setPendingAction(null);
    }

    return ok;
  };

  const handlePause = async (): Promise<void> => {
    await runCommand("pause", "agent.pause", {
      reason: pauseReason.trim() ? pauseReason.trim() : undefined,
    });
  };

  const handleResume = async (): Promise<void> => {
    await runCommand("resume", "agent.resume");
  };

  const handleRedirect = async ({
    taskId,
    taskPayload,
    priority,
  }: RedirectPayload): Promise<void> => {
    const trimmedTaskId = taskId?.trim();
    const hasPayload = typeof taskPayload !== "undefined";

    if (!trimmedTaskId && !hasPayload) {
      setStatus({
        tone: "error",
        message: "Redirect requires a task reference or payload.",
      });
      return;
    }

    await runCommand("redirect", "agent.redirect", {
      taskId: trimmedTaskId || undefined,
      taskPayload: hasPayload ? taskPayload : undefined,
      priority: priority || undefined,
    });
  };

  const handlePriorityOverride = async (): Promise<void> => {
    if (!overridePriority) {
      setStatus({ tone: "error", message: "Select a priority to override." });
      return;
    }

    const durationMs = Number(overrideDuration);
    await runCommand("priority", "agent.priority.override", {
      priority: overridePriority,
      durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : undefined,
    });
  };

  const handleKill = async (): Promise<boolean> => {
    return await runCommand("kill", "agent.kill", {
      sessionKey: sessionKey.trim() ? sessionKey.trim() : undefined,
    });
  };

  const handleRestart = async (): Promise<boolean> => {
    return await runCommand("restart", "agent.restart");
  };

  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle>Control Panel</CardTitle>
        <CardDescription>
          Dispatch live commands to this agent via the gateway bridge.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {displayedStatus && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge
              variant={
                displayedStatus.tone === "success"
                  ? "secondary"
                  : displayedStatus.tone === "pending"
                    ? "outline"
                    : "destructive"
              }
            >
              {displayedStatus.tone}
            </Badge>
            <span>{displayedStatus.message}</span>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Immediate control</p>
              <p className="text-xs text-muted-foreground">
                Pause or resume agent execution instantly.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePause}
                disabled={isBlocked}
              >
                <Pause className="mr-2 h-4 w-4" />
                {pendingAction === "pause" ? "Pausing..." : "Pause"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResume}
                disabled={isBlocked}
              >
                <PlayCircle className="mr-2 h-4 w-4" />
                {pendingAction === "resume" ? "Resuming..." : "Resume"}
              </Button>
            </div>
          </div>
          <Input
            placeholder="Optional pause reason"
            value={pauseReason}
            onChange={(event) => setPauseReason(event.target.value)}
            disabled={isBlocked}
          />
        </div>

        <Separator className="bg-border/60" />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Redirect</p>
              <p className="text-xs text-muted-foreground">
                Send the agent to a new task immediately.
              </p>
            </div>
            <RedirectDialog
              agentId={agentId}
              agentName={agentName}
              agentStatus={agentStatus}
              currentTaskTitle={currentTaskTitle}
              disabled={isBlocked}
              pending={pendingAction === "redirect"}
              onConfirm={handleRedirect}
            />
          </div>
        </div>

        <Separator className="bg-border/60" />

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Priority override</p>
            <p className="text-xs text-muted-foreground">
              Escalate or de-escalate task urgency for a window.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
            <div className="flex flex-wrap gap-2">
              {priorityOptions.map((priority) => (
                <Button
                  key={priority}
                  type="button"
                  size="sm"
                  variant={overridePriority === priority ? "secondary" : "outline"}
                  onClick={() => setOverridePriority(priority)}
                  disabled={isBlocked}
                >
                  {priority}
                </Button>
              ))}
            </div>
            <Input
              type="number"
              placeholder="Duration (ms)"
              value={overrideDuration}
              onChange={(event) => setOverrideDuration(event.target.value)}
              disabled={isBlocked}
            />
          </div>
          <Button
            size="sm"
            onClick={handlePriorityOverride}
            disabled={isBlocked}
          >
            <Flame className="mr-2 h-4 w-4" />
            {pendingAction === "priority" ? "Applying..." : "Override priority"}
          </Button>
        </div>

        <Separator className="bg-border/60" />

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Destructive</p>
            <p className="text-xs text-muted-foreground">
              Kill or restart the current session with caution.
            </p>
          </div>
          <Input
            placeholder="Session key (optional)"
            value={sessionKey}
            onChange={(event) => setSessionKey(event.target.value)}
            disabled={isBlocked}
          />
          <div className="flex flex-wrap gap-4">
            <Dialog
              open={killDialogOpen}
              onOpenChange={(open) => {
                if (pendingAction === "kill") {
                  return;
                }
                setKillDialogOpen(open);
                if (!open) {
                  setKillConfirmation("");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="destructive" size="default" className="min-h-11" disabled={isBlocked}>
                  <Siren className="mr-2 h-4 w-4" />
                  {pendingAction === "kill" ? "Killing..." : "Kill"}
                </Button>
              </DialogTrigger>
              <DialogContent
                onEscapeKeyDown={(event) => {
                  if (pendingAction === "kill") {
                    event.preventDefault();
                  }
                }}
                onInteractOutside={(event) => {
                  if (pendingAction === "kill") {
                    event.preventDefault();
                  }
                }}
              >
                <DialogHeader>
                  <DialogTitle>Confirm kill</DialogTitle>
                  <DialogDescription>
                    This will immediately terminate {agentDisplayName}&apos;s
                    active session and stop any in-flight work.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Target
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="max-w-[220px] truncate text-[10px]"
                      >
                        {agentDisplayName}
                      </Badge>
                      {trimmedAgentName && (
                        <Badge variant="secondary" className="text-[10px]">
                          {agentId}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3">
                    <p className="text-xs font-semibold text-destructive">
                      Immediate termination
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Killing {agentDisplayName} interrupts running tasks,
                      disconnects the session, and cannot be undone.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Type {killConfirmationCopy.hint} to proceed.
                    </p>
                    <Input
                      placeholder={`Type ${killConfirmationCopy.hint}`}
                      value={killConfirmation}
                      onChange={(event) => setKillConfirmation(event.target.value)}
                      disabled={isBlocked}
                    />
                  </div>
                </div>
                {pendingAction === "kill" && (
                  <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Awaiting bridge confirmation...
                  </div>
                )}
                <DialogFooter>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setKillDialogOpen(false)}
                    disabled={pendingAction === "kill"}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      const ok = await handleKill();
                      if (ok) {
                        setKillDialogOpen(false);
                        setKillConfirmation("");
                      }
                    }}
                    disabled={!killConfirmed || isBlocked}
                  >
                    {pendingAction === "kill" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Killing...
                      </>
                    ) : (
                      "Confirm kill"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={restartDialogOpen}
              onOpenChange={(open) => {
                if (pendingAction === "restart") {
                  return;
                }
                setRestartDialogOpen(open);
                if (!open) {
                  setRestartConfirmation("");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="destructive" size="default" className="min-h-11" disabled={isBlocked}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {pendingAction === "restart" ? "Restarting..." : "Restart"}
                </Button>
              </DialogTrigger>
              <DialogContent
                onEscapeKeyDown={(event) => {
                  if (pendingAction === "restart") {
                    event.preventDefault();
                  }
                }}
                onInteractOutside={(event) => {
                  if (pendingAction === "restart") {
                    event.preventDefault();
                  }
                }}
              >
                <DialogHeader>
                  <DialogTitle>Confirm restart</DialogTitle>
                  <DialogDescription>
                    This will restart {agentDisplayName}&apos;s session and reset
                    its in-memory context.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Target
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="max-w-[220px] truncate text-[10px]"
                      >
                        {agentDisplayName}
                      </Badge>
                      {trimmedAgentName && (
                        <Badge variant="secondary" className="text-[10px]">
                          {agentId}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3">
                    <p className="text-xs font-semibold text-destructive">
                      Context reset
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Restarting {agentDisplayName} clears its current context
                      and interrupts active work before the session is rebuilt.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Type {restartConfirmationCopy.hint} to proceed.
                    </p>
                    <Input
                      placeholder={`Type ${restartConfirmationCopy.hint}`}
                      value={restartConfirmation}
                      onChange={(event) => setRestartConfirmation(event.target.value)}
                      disabled={isBlocked}
                    />
                  </div>
                </div>
                {pendingAction === "restart" && (
                  <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Awaiting bridge confirmation...
                  </div>
                )}
                <DialogFooter>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRestartDialogOpen(false)}
                    disabled={pendingAction === "restart"}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      const ok = await handleRestart();
                      if (ok) {
                        setRestartDialogOpen(false);
                        setRestartConfirmation("");
                      }
                    }}
                    disabled={!restartConfirmed || isBlocked}
                  >
                    {pendingAction === "restart" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Restarting...
                      </>
                    ) : (
                      "Confirm restart"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
