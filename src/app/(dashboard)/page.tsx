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
  Activity,
  Brain,
  ShieldAlert,
  Telescope,
} from "lucide-react";

const stats = [
  {
    title: "Active Agents",
    value: "3",
    detail: "12 total registered",
    icon: Activity,
  },
  {
    title: "Queued Tasks",
    value: "27",
    detail: "8 blocked",
    icon: Telescope,
  },
  {
    title: "Decisions Pending",
    value: "6",
    detail: "Awaiting review",
    icon: Brain,
  },
  {
    title: "Critical Alerts",
    value: "2",
    detail: "Last 24h",
    icon: ShieldAlert,
  },
];

export default function DashboardPage() {
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
            <Badge variant="outline">Clawdbot Fleet</Badge>
            <Badge variant="secondary">North America</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <AgentStatusGrid agents={mockAgents} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Mission Pulse</CardTitle>
            <CardDescription>
              Highlights from the last 60 minutes of activity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-foreground font-medium">
                  Context graph sync complete
                </p>
                <p>14 new dependencies detected across active tasks.</p>
              </div>
              <Badge variant="outline">2m ago</Badge>
            </div>
            <Separator />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-foreground font-medium">
                  Analyst #12 flagged escalation
                </p>
                <p>CTO briefing needs approval on risk language.</p>
              </div>
              <Badge variant="outline">7m ago</Badge>
            </div>
            <Separator />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-foreground font-medium">
                  Telemetry uplink stable
                </p>
                <p>Streaming 48k events/hour across mission nodes.</p>
              </div>
              <Badge variant="outline">12m ago</Badge>
            </div>
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
            <div className="rounded-xl border border-border/60 bg-background/50 p-4">
              <p className="text-foreground font-medium">
                PR #234 security review
              </p>
              <p className="mt-1">
                Claimed SQL injection risk at line 142. Needs approval.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="secondary">Decision</Badge>
                <Badge variant="outline">High</Badge>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/50 p-4">
              <p className="text-foreground font-medium">
                Analyst #12 escalation
              </p>
              <p className="mt-1">
                Awaiting redirection on Q4 support ticket synthesis.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="secondary">Blocked</Badge>
                <Badge variant="outline">Medium</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
