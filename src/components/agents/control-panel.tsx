"use client";

import { useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { OperationStatus } from "@/lib/controls/operation-status";
import {
  createRequestId,
  useOptimisticOperationsStore,
} from "@/lib/controls/optimistic-operations";
import { cn } from "@/lib/utils";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  Flame,
  Pause,
  PlayCircle,
  RefreshCw,
  Siren,
} from "lucide-react";

const priorities = ["low", "medium", "high", "critical"] as const;

type Priority = (typeof priorities)[number];

type TaskOption = {
  id: string;
  title: string;
  status: string;
  priority: Priority;
};

type ControlPanelProps = {
  agentId: string;
  agentName?: string;
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
  const [redirectTaskId, setRedirectTaskId] = useState("");
  const [redirectDialogOpen, setRedirectDialogOpen] = useState(false);
  const [redirectSearch, setRedirectSearch] = useState("");
  const [redirectPriority, setRedirectPriority] = useState<Priority | "">("");
  const [overridePriority, setOverridePriority] = useState<Priority | "">("");
  const [overrideDuration, setOverrideDuration] = useState("");
  const [sessionKey, setSessionKey] = useState("");
  const [killDialogOpen, setKillDialogOpen] = useState(false);
  const [restartDialogOpen, setRestartDialogOpen] = useState(false);
  const [killConfirmation, setKillConfirmation] = useState("");
  const [restartConfirmation, setRestartConfirmation] = useState("");

  const tasks = useQuery(
    api.tasks.list,
    disabled ? "skip" : { limit: 40 }
  );
  const taskOptions = useMemo<TaskOption[]>(
    () =>
      (tasks ?? []).map((task) => ({
        id: String(task._id),
        title: task.title,
        status: task.status,
        priority: task.priority as Priority,
      })),
    [tasks]
  );
  const selectedTask = useMemo(
    () => taskOptions.find((task) => task.id === redirectTaskId),
    [redirectTaskId, taskOptions]
  );
  const filteredTasks = useMemo(() => {
    if (taskOptions.length === 0) {
      return [];
    }
    const normalized = redirectSearch.trim().toLowerCase();
    const options = normalized
      ? taskOptions.filter(
          (task) =>
            task.title.toLowerCase().includes(normalized) ||
            task.id.toLowerCase().includes(normalized)
        )
      : taskOptions;
    return options.slice(0, normalized ? 20 : 8);
  }, [redirectSearch, taskOptions]);

  const taskListMessage = disabled
    ? "Connect Convex to load tasks."
    : tasks === undefined
      ? "Loading tasks..."
      : taskOptions.length === 0
        ? "No tasks available yet."
        : null;

  const normalizedAgentName = agentName?.trim().toLowerCase();
  const confirmationHint = agentName?.trim()
    ? `${agentName} or CONFIRM`
    : "CONFIRM";

  const isConfirmationValid = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    if (normalized === "confirm") {
      return true;
    }
    if (normalizedAgentName) {
      return normalized === normalizedAgentName;
    }
    return false;
  };

  const killConfirmed = isConfirmationValid(killConfirmation);
  const restartConfirmed = isConfirmationValid(restartConfirmation);

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
  ): Promise<void> => {
    if (disabled || !dispatch) {
      setStatus({
        tone: "error",
        message: disabled
          ? "Controls are unavailable without a Convex connection."
          : "Controls API not deployed yet.",
      });
      return;
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
  };

  const handlePause = async (): Promise<void> => {
    await runCommand("pause", "agent.pause", {
      reason: pauseReason.trim() ? pauseReason.trim() : undefined,
    });
  };

  const handleResume = async (): Promise<void> => {
    await runCommand("resume", "agent.resume");
  };

  const handleRedirect = async (): Promise<void> => {
    const taskId = redirectTaskId.trim();
    if (!taskId) {
      setStatus({ tone: "error", message: "Redirect requires a task ID." });
      return;
    }

    await runCommand("redirect", "agent.redirect", {
      taskId,
      priority: redirectPriority || undefined,
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

  const handleKill = async (): Promise<void> => {
    await runCommand("kill", "agent.kill", {
      sessionKey: sessionKey.trim() ? sessionKey.trim() : undefined,
    });
  };

  const handleRestart = async (): Promise<void> => {
    await runCommand("restart", "agent.restart");
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
            <Dialog
              open={redirectDialogOpen}
              onOpenChange={(open) => {
                setRedirectDialogOpen(open);
                if (!open) {
                  setRedirectSearch("");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isBlocked}>
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Redirect task
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>Redirect agent</DialogTitle>
                  <DialogDescription>
                    Choose a task destination and optional priority override.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Task ID
                    </p>
                    <Input
                      placeholder="Paste a task ID"
                      value={redirectTaskId}
                      onChange={(event) => setRedirectTaskId(event.target.value)}
                      disabled={isBlocked}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Paste the task ID directly, or pick from the task list below.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <p className="font-medium">Task search</p>
                      {taskOptions.length > 0 && (
                        <span>{taskOptions.length} tasks</span>
                      )}
                    </div>
                    <Input
                      placeholder="Search by title or task ID"
                      value={redirectSearch}
                      onChange={(event) => setRedirectSearch(event.target.value)}
                      disabled={disabled}
                    />
                    <div className="rounded-lg border border-border/60 bg-background/60">
                      <ScrollArea className="max-h-48">
                        <div
                          role="listbox"
                          aria-label="Task results"
                          className="divide-y divide-border/60"
                        >
                          {taskListMessage && (
                            <div className="p-3 text-xs text-muted-foreground">
                              {taskListMessage}
                            </div>
                          )}
                          {!taskListMessage &&
                            filteredTasks.map((task) => (
                              <button
                                key={task.id}
                                type="button"
                                role="option"
                                aria-selected={redirectTaskId === task.id}
                                onClick={() => {
                                  setRedirectTaskId(task.id);
                                  setRedirectSearch("");
                                }}
                                className={cn(
                                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition",
                                  "hover:bg-muted/40",
                                  redirectTaskId === task.id
                                    ? "bg-primary/10 text-foreground"
                                    : "text-muted-foreground"
                                )}
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm text-foreground">
                                    {task.title}
                                  </p>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {task.id}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] capitalize">
                                    {task.status}
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px] capitalize">
                                    {task.priority}
                                  </Badge>
                                </div>
                              </button>
                            ))}
                          {!taskListMessage && filteredTasks.length === 0 && (
                            <div className="p-3 text-xs text-muted-foreground">
                              No matching tasks. Try another search term.
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Priority picker
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {priorities.map((priority) => (
                        <Button
                          key={priority}
                          type="button"
                          size="sm"
                          variant={
                            redirectPriority === priority ? "secondary" : "outline"
                          }
                          onClick={() => setRedirectPriority(priority)}
                          disabled={isBlocked}
                        >
                          {priority}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
                    {redirectTaskId ? (
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Selected task
                        </p>
                        <p className="text-sm text-foreground">
                          {selectedTask?.title ?? "Custom task ID"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {redirectTaskId}
                        </p>
                      </div>
                    ) : (
                      "No task selected yet."
                    )}
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRedirectDialogOpen(false)}
                    disabled={pendingAction === "redirect"}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await handleRedirect();
                      if (redirectTaskId.trim()) {
                        setRedirectDialogOpen(false);
                        setRedirectSearch("");
                      }
                    }}
                    disabled={isBlocked}
                  >
                    <ArrowRight className="mr-2 h-4 w-4" />
                    {pendingAction === "redirect" ? "Redirecting..." : "Dispatch redirect"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
            {redirectTaskId ? (
              <>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Redirect target
                </p>
                <p className="text-sm text-foreground">
                  {selectedTask?.title ?? "Custom task ID"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {redirectTaskId}
                </p>
              </>
            ) : (
              "No redirect target selected. Use the redirect dialog to choose a task."
            )}
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
              {priorities.map((priority) => (
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
          <div className="flex flex-wrap gap-2">
            <Dialog
              open={killDialogOpen}
              onOpenChange={(open) => {
                setKillDialogOpen(open);
                if (!open) {
                  setKillConfirmation("");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isBlocked}>
                  <Siren className="mr-2 h-4 w-4" />
                  {pendingAction === "kill" ? "Killing..." : "Kill"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm kill</DialogTitle>
                  <DialogDescription>
                    This will terminate the active session immediately.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Type {confirmationHint} to proceed.
                  </p>
                  <Input
                    placeholder={`Type ${confirmationHint}`}
                    value={killConfirmation}
                    onChange={(event) => setKillConfirmation(event.target.value)}
                    disabled={isBlocked}
                  />
                </div>
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
                      await handleKill();
                      setKillDialogOpen(false);
                      setKillConfirmation("");
                    }}
                    disabled={!killConfirmed || isBlocked}
                  >
                    {pendingAction === "kill" ? "Killing..." : "Confirm kill"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={restartDialogOpen}
              onOpenChange={(open) => {
                setRestartDialogOpen(open);
                if (!open) {
                  setRestartConfirmation("");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isBlocked}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {pendingAction === "restart" ? "Restarting..." : "Restart"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm restart</DialogTitle>
                  <DialogDescription>
                    This will restart the agent session and reset its context.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Type {confirmationHint} to proceed.
                  </p>
                  <Input
                    placeholder={`Type ${confirmationHint}`}
                    value={restartConfirmation}
                    onChange={(event) => setRestartConfirmation(event.target.value)}
                    disabled={isBlocked}
                  />
                </div>
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
                      await handleRestart();
                      setRestartDialogOpen(false);
                      setRestartConfirmation("");
                    }}
                    disabled={!restartConfirmed || isBlocked}
                  >
                    {pendingAction === "restart" ? "Restarting..." : "Confirm restart"}
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
