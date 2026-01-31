"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HeartbeatIndicator } from "@/components/agents/heartbeat-indicator";
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

type HeartbeatStatus = "online" | "degraded" | "offline";

type AgentCardProps = {
  agent: AgentSummary;
  heartbeatStatus?: HeartbeatStatus;
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

function AgentCard({ agent, heartbeatStatus }: AgentCardProps): React.ReactElement {
  const TypeIcon = typeIcons[agent.type];
  const config = statusConfig[agent.status];
  const StatusIcon = config.icon;

  return (
    <Link href={`/agents/${agent._id}`}>
      <Card
        className={cn(
          "group border-border/60 bg-card/40 backdrop-blur-sm transition-all",
          "hover:border-border/80 hover:bg-card/60 cursor-pointer",
          agent.status === "active" && "ring-1 ring-primary/20"
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
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
              <HeartbeatIndicator
                status={heartbeatStatus}
                className="text-[9px] px-1.5 py-0"
              />
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
    </div>
  );
}
