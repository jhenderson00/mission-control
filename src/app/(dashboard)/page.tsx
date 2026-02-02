"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/dashboard/page-header";
import { AgentStatusGrid } from "@/components/dashboard/agent-status-grid";
import { DiagnosticPanel } from "@/components/dashboard/diagnostic-panel";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatRelativeTime } from "@/lib/format";
import { mockAgents } from "@/lib/mock-data";
import type { AgentSummary } from "@/lib/agent-types";
import {
  Activity,
  Brain,
  ShieldAlert,
  Telescope,
} from "lucide-react";

const fallbackStats = {
  activeAgents: 3,
  totalAgents: 12,
  queuedTasks: 27,
  blockedTasks: 8,
  pendingDecisions: 6,
  alertCount: 2,
};

const fallbackPulse: MissionPulseItem[] = [
  {
    id: "pulse_1",
    title: "Context graph sync complete",
    detail: "14 new dependencies detected across active tasks.",
    timeLabel: "2m ago",
  },
  {
    id: "pulse_2",
    title: "Analyst #12 flagged escalation",
    detail: "CTO briefing needs approval on risk language.",
    timeLabel: "7m ago",
  },
  {
    id: "pulse_3",
    title: "Telemetry uplink stable",
    detail: "Streaming 48k events/hour across mission nodes.",
    timeLabel: "12m ago",
  },
];

const fallbackCritical: CriticalQueueItem[] = [
  {
    id: "critical_1",
    title: "PR #234 security review",
    detail: "Claimed SQL injection risk at line 142. Needs approval.",
    tags: ["Decision", "High"],
  },
  {
    id: "critical_2",
    title: "Analyst #12 escalation",
    detail: "Awaiting redirection on Q4 support ticket synthesis.",
    tags: ["Blocked", "Medium"],
  },
];

function getAgentCounts(agents: AgentSummary[]) {
  return agents.reduce(
    (acc, agent) => {
      acc.total += 1;
      acc[agent.status] += 1;
      return acc;
    },
    { total: 0, active: 0, idle: 0, blocked: 0, failed: 0 }
  );
}

const fallbackAgentCounts = getAgentCounts(mockAgents);
const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

type PulseEvent = {
  _id?: string;
  createdAt?: number;
  type: string;
  content: string;
};

type QueueDecision = {
  _id?: string;
  createdAt?: number;
  decision: string;
  reasoning: string;
};

type MissionPulseItem = {
  id: string | number;
  title: string;
  detail: string;
  timeLabel: string;
};

type CriticalQueueItem = {
  id: string | number;
  title: string;
  detail: string;
  tags: string[];
};

export default function DashboardPage() {
  const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  const agentCounts = useQuery(api.agents.statusCounts, {});
  const presenceCounts = useQuery(api.agents.presenceCounts, {});
  const taskCounts = useQuery(api.tasks.statusCounts, {});
  const pendingCount = useQuery(api.decisions.pendingCount, {});
  const alertCounts = useQuery(api.events.countsByType, {
    since: twentyFourHoursAgo,
  });

  const agents = useQuery(api.agents.listWithTasks, {});
  const recentEvents = useQuery(api.events.listRecent, { limit: 3 });
  const pendingDecisions = useQuery(api.decisions.listRecent, {
    limit: 2,
    outcome: "pending",
  });

  const activeAgents = hasConvex
    ? presenceCounts?.active ?? agentCounts?.active
    : fallbackAgentCounts.active;
  const totalAgents = hasConvex
    ? presenceCounts?.total ?? agentCounts?.total
    : fallbackAgentCounts.total;
  const queuedTasks = hasConvex
    ? taskCounts?.queued
    : fallbackStats.queuedTasks;
  const blockedTasks = hasConvex
    ? taskCounts?.blocked
    : fallbackStats.blockedTasks;
  const pendingDecisionsCount = hasConvex
    ? pendingCount
    : fallbackStats.pendingDecisions;
  const criticalAlerts = hasConvex
    ? alertCounts?.error
    : fallbackStats.alertCount;

  const stats = [
    {
      title: "Active Agents",
      value: activeAgents ?? "—",
      detail: `${totalAgents ?? "—"} total registered`,
      icon: Activity,
    },
    {
      title: "Queued Tasks",
      value: queuedTasks ?? "—",
      detail: `${blockedTasks ?? "—"} blocked`,
      icon: Telescope,
    },
    {
      title: "Decisions Pending",
      value: pendingDecisionsCount ?? "—",
      detail: "Awaiting review",
      icon: Brain,
    },
    {
      title: "Critical Alerts",
      value: criticalAlerts ?? "—",
      detail: "Last 24h",
      icon: ShieldAlert,
    },
  ];

  const isAgentsLoading = hasConvex && agents === undefined;
  const agentGridData: AgentSummary[] = hasConvex ? agents ?? [] : mockAgents;

  const missionPulse: MissionPulseItem[] = !hasConvex
    ? fallbackPulse
    : (recentEvents ?? []).map((event: PulseEvent) => ({
        id: event._id ?? event.createdAt ?? event.type,
        title: event.type.replace(/[_\.]/g, " "),
        detail: event.content,
        timeLabel: formatRelativeTime(event.createdAt, "just now"),
      }));

  const criticalQueue: CriticalQueueItem[] = !hasConvex
    ? fallbackCritical
    : (pendingDecisions ?? []).map((decision: QueueDecision) => ({
        id: decision._id ?? decision.createdAt ?? decision.decision,
        title: decision.decision,
        detail: decision.reasoning,
        tags: ["Decision", "Pending"],
      }));

  const isMissionPulseLoading = hasConvex && recentEvents === undefined;
  const isCriticalQueueLoading = hasConvex && pendingDecisions === undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Mission Overview"
        description="Command the fleet, align missions, and monitor real-time signals."
        badge="Live"
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="border-border/60 bg-card/40">
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardDescription>{stat.title}</CardDescription>
                  <CardTitle className="text-3xl font-semibold font-display">
                    {stat.value}
                  </CardTitle>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {stat.detail}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card className="border-border/60 bg-card/40">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Agent Status Grid</CardTitle>
            <CardDescription>
              Live activity across operators, models, and mission focus.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Cydni Fleet</Badge>
            <Badge variant="secondary">North America</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isAgentsLoading ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
              Loading agent telemetry...
            </div>
          ) : (
            <AgentStatusGrid agents={agentGridData} />
          )}
        </CardContent>
      </Card>

      <DiagnosticPanel />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Mission Pulse</CardTitle>
            <CardDescription>
              Highlights from the last 60 minutes of activity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            {isMissionPulseLoading && (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                Loading mission pulse...
              </div>
            )}
            {!isMissionPulseLoading && missionPulse.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                No recent activity events yet.
              </div>
            )}
            {!isMissionPulseLoading &&
              missionPulse.map((item, index) => (
                <div key={item.id}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-foreground font-medium">
                        {item.title}
                      </p>
                      <p>{item.detail}</p>
                    </div>
                    <Badge variant="outline" className="w-fit shrink-0">
                      {item.timeLabel}
                    </Badge>
                  </div>
                  {index !== missionPulse.length - 1 && <Separator />}
                </div>
              ))}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Critical Queue</CardTitle>
            <CardDescription>
              Decisions and blockers waiting on operator input.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            {isCriticalQueueLoading && (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                Loading critical queue...
              </div>
            )}
            {!isCriticalQueueLoading && criticalQueue.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                No pending decisions yet.
              </div>
            )}
            {!isCriticalQueueLoading &&
              criticalQueue.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-border/60 bg-background/50 p-4"
                >
                  <p className="text-foreground font-medium">{item.title}</p>
                  <p className="mt-1">{item.detail}</p>
                  <div className="mt-3 flex items-center gap-2">
                    {item.tags.map((tag) => (
                      <Badge key={tag} variant={tag === "Decision" ? "secondary" : "outline"}>
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
