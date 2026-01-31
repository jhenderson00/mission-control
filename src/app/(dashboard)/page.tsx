import { PageHeader } from "@/components/dashboard/page-header";
import { AgentStatusGrid } from "@/components/dashboard/agent-status-grid";
import { mockAgents } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Users,
  ListChecks,
  AlertCircle,
  GitBranch,
  Activity,
  Zap,
  Clock,
  TrendingUp,
} from "lucide-react";

// Mock metrics for dashboard
const metrics = [
  {
    title: "Active Agents",
    value: "3",
    change: "+2 from idle",
    icon: Users,
    color: "text-emerald-400",
  },
  {
    title: "Queued Tasks",
    value: "8",
    change: "2 high priority",
    icon: ListChecks,
    color: "text-blue-400",
  },
  {
    title: "Blocked",
    value: "1",
    change: "Needs input",
    icon: AlertCircle,
    color: "text-amber-400",
  },
  {
    title: "Decisions Today",
    value: "24",
    change: "6 pending review",
    icon: GitBranch,
    color: "text-violet-400",
  },
];

const recentActivity = [
  {
    time: "2m ago",
    agent: "Claude Code #47",
    action: "Completed PR review",
    type: "complete",
  },
  {
    time: "5m ago",
    agent: "Analyst #12",
    action: "Started CTO briefing synthesis",
    type: "start",
  },
  {
    time: "8m ago",
    agent: "Writer #3",
    action: "Blocked: waiting for context",
    type: "blocked",
  },
  {
    time: "12m ago",
    agent: "Critic #12",
    action: "Decision: flag security issue",
    type: "decision",
  },
  {
    time: "15m ago",
    agent: "Cydni",
    action: "Spawned Claude Code #47",
    type: "spawn",
  },
];

const activityTypeStyles = {
  complete: "text-emerald-400",
  start: "text-blue-400",
  blocked: "text-amber-400",
  decision: "text-violet-400",
  spawn: "text-cyan-400",
};

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Mission Overview"
        description="Real-time visibility into your AI organization"
        badge="Live"
      />

      {/* Metrics grid */}
      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.title} className="border-border/40 bg-card/30">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs">
                    {metric.title}
                  </CardDescription>
                  <Icon className={`h-4 w-4 ${metric.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tracking-tight">
                  {metric.value}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {metric.change}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Agent Status Grid */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Agent Fleet</h2>
          <Badge variant="outline" className="gap-1">
            <Activity className="h-3 w-3" />
            Live
          </Badge>
        </div>
        <AgentStatusGrid agents={mockAgents} />
      </section>

      {/* Activity feed and stats */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Recent Activity */}
        <Card className="border-border/40 bg-card/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <Badge variant="secondary" className="text-xs">
                Last 30 min
              </Badge>
            </div>
            <CardDescription>
              Real-time feed of agent actions and decisions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                    <Zap
                      className={`h-4 w-4 ${activityTypeStyles[activity.type as keyof typeof activityTypeStyles]}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{activity.action}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {activity.agent}
                      </span>
                      <span className="text-xs text-muted-foreground/60">•</span>
                      <span className="text-xs text-muted-foreground/60">
                        {activity.time}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card className="border-border/40 bg-card/30">
          <CardHeader>
            <CardTitle className="text-base">Today's Stats</CardTitle>
            <CardDescription>Performance metrics for the fleet</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Avg task time</span>
              </div>
              <span className="text-sm font-medium">8.4 min</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Tasks completed</span>
              </div>
              <span className="text-sm font-medium">12</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Token usage</span>
              </div>
              <span className="text-sm font-medium">84.2k</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Decision accuracy</span>
              </div>
              <span className="text-sm font-medium text-emerald-400">96%</span>
            </div>
            <Separator />
            <div className="rounded-lg bg-muted/30 p-3 text-center">
              <p className="text-xs text-muted-foreground">Estimated cost today</p>
              <p className="text-lg font-semibold mt-1">$2.47</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
