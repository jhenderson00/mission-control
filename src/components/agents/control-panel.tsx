"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
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

type ControlPanelProps = {
  agentId: string;
  disabled?: boolean;
};

type DispatchStatus = {
  tone: "success" | "error" | "pending";
  message: string;
};

// Check if controls API is available (Convex may not have it deployed yet)
const hasControlsApi = typeof api.controls?.dispatch !== "undefined";

export function ControlPanel({ agentId, disabled = false }: ControlPanelProps): React.ReactElement {
  // Only call useAction if the API exists to avoid crashes
  const dispatch = hasControlsApi ? useAction(api.controls.dispatch) : null;
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [status, setStatus] = useState<DispatchStatus | null>(null);

  const [pauseReason, setPauseReason] = useState("");
  const [redirectTaskId, setRedirectTaskId] = useState("");
  const [redirectPriority, setRedirectPriority] = useState<Priority | "">("");
  const [overridePriority, setOverridePriority] = useState<Priority | "">("");
  const [overrideDuration, setOverrideDuration] = useState("");
  const [sessionKey, setSessionKey] = useState("");

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

    setPendingAction(actionKey);
    setStatus({ tone: "pending", message: "Dispatching control command..." });

    try {
      const response = await dispatch({
        agentId,
        command,
        params,
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
          <div>
            <p className="text-sm font-medium text-foreground">Redirect</p>
            <p className="text-xs text-muted-foreground">
              Send the agent to a new task immediately.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
            <Input
              placeholder="Task ID"
              value={redirectTaskId}
              onChange={(event) => setRedirectTaskId(event.target.value)}
              disabled={isBlocked}
            />
            <div className="flex flex-wrap gap-2">
              {priorities.map((priority) => (
                <Button
                  key={priority}
                  type="button"
                  size="sm"
                  variant={redirectPriority === priority ? "secondary" : "outline"}
                  onClick={() => setRedirectPriority(priority)}
                  disabled={isBlocked}
                >
                  {priority}
                </Button>
              ))}
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleRedirect}
            disabled={isBlocked}
          >
            <ArrowRight className="mr-2 h-4 w-4" />
            {pendingAction === "redirect" ? "Redirecting..." : "Redirect"}
          </Button>
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
            <Button
              variant="destructive"
              size="sm"
              onClick={handleKill}
              disabled={isBlocked}
            >
              <Siren className="mr-2 h-4 w-4" />
              {pendingAction === "kill" ? "Killing..." : "Kill"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRestart}
              disabled={isBlocked}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {pendingAction === "restart" ? "Restarting..." : "Restart"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
