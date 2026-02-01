"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HeartbeatIndicator } from "@/components/agents/heartbeat-indicator";
import { BulkActionBar } from "@/components/agents/bulk-action-bar";
import { useAgentStatus } from "@/lib/realtime";
import {
  Cpu,
  Brain,
  Target,
  Search,
  Wrench,
  Clock,
  AlertCircle,
  CheckCircle2,
  Pause,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import type { AgentSummary, AgentType, AgentStatus } from "@/lib/agent-types";

type HeartbeatStatus = "online" | "offline" | "busy" | "paused";

type AgentCardProps = {
  agent: AgentSummary;
  heartbeatStatus?: HeartbeatStatus;
  isSelected: boolean;
  onSelectionChange: (agentId: string, isSelected: boolean) => void;
};

const typeIcons: Record<AgentType, typeof Cpu> = {
  coordinator: Brain,
  planner: Target,
  executor: Wrench,
  critic: Search,
  specialist: Cpu,
};

const typeLabels: Record<AgentType, string> = {
  coordinator: "Coordinator",
  planner: "Planner",
  executor: "Executor",
  critic: "Critic",
  specialist: "Specialist",
};

const statusConfig: Record<
  AgentStatus,
  { icon: typeof CheckCircle2; color: string; bgColor: string }
> = {
  active: {
    icon: CheckCircle2,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  idle: {
    icon: Pause,
    color: "text-zinc-400",
    bgColor: "bg-zinc-400/10",
  },
  blocked: {
    icon: AlertCircle,
    color: "text-amber-400",
    bgColor: "bg-amber-400/10",
  },
  failed: {
    icon: XCircle,
    color: "text-red-400",
    bgColor: "bg-red-400/10",
  },
};

function ProgressBar({ status }: { status: AgentStatus }): React.ReactElement {
  const progress = status === "active" ? 60 : status === "blocked" ? 30 : 0;

  return (
    <div className="flex gap-0.5 h-1.5 w-full">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-sm transition-colors",
            i < progress / 10
              ? status === "active"
                ? "bg-primary"
                : status === "blocked"
                  ? "bg-amber-400"
                  : status === "failed"
                    ? "bg-red-500"
                    : "bg-zinc-600"
              : "bg-zinc-700/50"
          )}
        />
      ))}
    </div>
  );
}

function AgentCard({
  agent,
  heartbeatStatus,
  isSelected,
  onSelectionChange,
}: AgentCardProps): React.ReactElement {
  const TypeIcon = typeIcons[agent.type];
  const config = statusConfig[agent.status];
  const StatusIcon = config.icon;
  const checkboxId = `agent-select-${agent._id}`;

  return (
    <Link href={`/agents/${agent._id}`}>
      <Card
        className={cn(
          "group border-border/60 bg-card/40 backdrop-blur-sm transition-all",
          "hover:border-border/80 hover:bg-card/60 cursor-pointer",
          agent.status === "active" && "ring-1 ring-primary/20",
          isSelected && "ring-2 ring-primary/50"
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div
                className="flex items-center"
                data-selection-control="true"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={isSelected}
                  onChange={(event) =>
                    onSelectionChange(agent._id, event.target.checked)
                  }
                  aria-label={`Select ${agent.name}`}
                  className="h-4 w-4 rounded border-border/60 bg-background/70 text-primary accent-primary"
                />
              </div>
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  config.bgColor
                )}
              >
                <TypeIcon className={cn("h-4 w-4", config.color)} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground leading-none">
                  {agent.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {typeLabels[agent.type]}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5">
                <StatusIcon className={cn("h-3.5 w-3.5", config.color)} />
                <span className={cn("text-xs font-medium capitalize", config.color)}>
                  {agent.status}
                </span>
              </div>
              {/* Only show heartbeat when it indicates a problem (offline/paused) */}
              {(heartbeatStatus === "offline" || heartbeatStatus === "paused") && (
                <HeartbeatIndicator
                  status={heartbeatStatus}
                  className="text-[9px] px-1.5 py-0"
                />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {agent.currentTask ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Current task</p>
              <p className="text-sm text-foreground truncate">
                {agent.currentTask.title}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No active task</p>
          )}

          <ProgressBar status={agent.status} />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{formatDuration(agent.startedAt) || "Idle"}</span>
            </div>
            <Badge variant="outline" className="text-[10px] h-5 max-w-[140px] truncate">
              {agent.model}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

interface AgentStatusGridProps {
  agents: AgentSummary[];
  className?: string;
}

export function AgentStatusGrid({
  agents,
  className,
}: AgentStatusGridProps): React.ReactElement {
  const agentIds = useMemo(() => agents.map((agent) => agent._id), [agents]);
  const { statusByAgent } = useAgentStatus({ agentIds });
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(
    () => new Set()
  );
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const agentIdSet = new Set(agentIds);
    setSelectedAgentIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (agentIdSet.has(id)) {
          next.add(id);
        }
      }
      return next;
    });
  }, [agentIds]);

  const selectedAgents = useMemo(
    () => agents.filter((agent) => selectedAgentIds.has(agent._id)),
    [agents, selectedAgentIds]
  );

  const handleSelectionChange = useCallback(
    (agentId: string, isSelected: boolean) => {
      setSelectedAgentIds((prev) => {
        const next = new Set(prev);
        if (isSelected) {
          next.add(agentId);
        } else {
          next.delete(agentId);
        }
        return next;
      });
    },
    []
  );

  const handleSelectAll = useCallback(
    (isSelected: boolean) => {
      if (isSelected) {
        setSelectedAgentIds(new Set(agentIds));
      } else {
        setSelectedAgentIds(new Set());
      }
    },
    [agentIds]
  );

  const handleClearSelection = useCallback(() => {
    setSelectedAgentIds(new Set());
  }, []);

  const totalAgents = agents.length;
  const selectedCount = selectedAgentIds.size;
  const isAllSelected = totalAgents > 0 && selectedCount === totalAgents;
  const isPartiallySelected = selectedCount > 0 && selectedCount < totalAgents;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isPartiallySelected;
    }
  }, [isPartiallySelected]);

  useEffect(() => {
    if (totalAgents === 0) {
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
      if (event.defaultPrevented || isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "a") {
        event.preventDefault();
        handleSelectAll(true);
        return;
      }

      if (key === "escape" && selectedCount > 0) {
        event.preventDefault();
        handleClearSelection();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClearSelection, handleSelectAll, selectedCount, totalAgents]);

  const { activeAgents, idleAgents, blockedAgents, failedAgents, standbyAgents } =
    useMemo(() => {
      const active: AgentSummary[] = [];
      const idle: AgentSummary[] = [];
      const blocked: AgentSummary[] = [];
      const failed: AgentSummary[] = [];

      for (const agent of agents) {
        switch (agent.status) {
          case "active":
            active.push(agent);
            break;
          case "idle":
            idle.push(agent);
            break;
          case "blocked":
            blocked.push(agent);
            break;
          case "failed":
            failed.push(agent);
            break;
          default:
            break;
        }
      }

      return {
        activeAgents: active,
        idleAgents: idle,
        blockedAgents: blocked,
        failedAgents: failed,
        standbyAgents: [...blocked, ...failed, ...idle],
      };
    }, [agents]);

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-muted-foreground">
              Active <span className="text-foreground font-medium">{activeAgents.length}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-zinc-400" />
            <span className="text-muted-foreground">
              Idle <span className="text-foreground font-medium">{idleAgents.length}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-muted-foreground">
              Blocked <span className="text-foreground font-medium">{blockedAgents.length}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            <span className="text-muted-foreground">
              Failed <span className="text-foreground font-medium">{failedAgents.length}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <label htmlFor="agent-select-all" className="flex items-center gap-2">
            <input
              ref={selectAllRef}
              id="agent-select-all"
              type="checkbox"
              checked={isAllSelected}
              onChange={(event) => handleSelectAll(event.target.checked)}
              aria-checked={isPartiallySelected ? "mixed" : isAllSelected}
              disabled={totalAgents === 0}
              className="h-4 w-4 rounded border-border/60 bg-background/70 text-primary accent-primary"
            />
            <span>Select all</span>
          </label>
          <span>
            {selectedCount} of {totalAgents} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearSelection}
            disabled={selectedCount === 0}
          >
            Clear selection
          </Button>
        </div>
      </div>

      {activeAgents.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Active Agents
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeAgents.map((agent) => (
              <AgentCard
                key={agent._id}
                agent={agent}
                heartbeatStatus={statusByAgent.get(agent._id)?.status}
                isSelected={selectedAgentIds.has(agent._id)}
                onSelectionChange={handleSelectionChange}
              />
            ))}
          </div>
        </section>
      )}

      {(idleAgents.length > 0 || blockedAgents.length > 0 || failedAgents.length > 0) && (
        <section>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Standby
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {standbyAgents.map((agent) => (
              <AgentCard
                key={agent._id}
                agent={agent}
                heartbeatStatus={statusByAgent.get(agent._id)?.status}
                isSelected={selectedAgentIds.has(agent._id)}
                onSelectionChange={handleSelectionChange}
              />
            ))}
          </div>
        </section>
      )}

      {agents.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Brain className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p>No agents registered</p>
          <p className="text-sm mt-1">Agents will appear here when spawned</p>
        </div>
      )}

      <BulkActionBar
        selectedAgents={selectedAgents}
        onClearSelection={handleClearSelection}
      />
    </div>
  );
}
