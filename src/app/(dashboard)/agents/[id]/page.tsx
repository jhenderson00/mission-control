import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { mockAgents } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  ArrowRight,
  Pause,
  PlayCircle,
  Siren,
} from "lucide-react";

const mockEvents = [
  {
    id: "event_1",
    time: "7:18 PM",
    type: "tool_call",
    summary: "read_file(\"src/api/routes.ts\")",
  },
  {
    id: "event_2",
    time: "7:19 PM",
    type: "message",
    summary: "Flagged potential SQL injection in PR #234",
  },
  {
    id: "event_3",
    time: "7:20 PM",
    type: "tool_result",
    summary: "npm test → 47 passed, 0 failed",
  },
];

const mockDecisions = [
  {
    id: "decision_1",
    title: "Escalate SQL injection risk",
    confidence: "0.92",
    outcome: "pending",
  },
  {
    id: "decision_2",
    title: "Request human approval on release note",
    confidence: "0.78",
    outcome: "pending",
  },
];

const statusStyles: Record<string, string> = {
  active: "bg-primary/15 text-primary",
  idle: "bg-muted text-muted-foreground",
  blocked: "bg-amber-400/15 text-amber-300",
  failed: "bg-red-500/15 text-red-300",
};

function formatDuration(startedAt?: number) {
  if (!startedAt) return "Idle";
  const diff = Date.now() - startedAt;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m active`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m active`;
}

export default function AgentDetailPage({ params }: { params: { id: string } }) {
  const agent = mockAgents.find((item) => item._id === params.id);

  if (!agent) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={agent.name}
        description={`Model ${agent.model} · ${agent.host.toUpperCase()} node`}
        badge={agent.status === "active" ? "Live" : agent.status}
      />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Agent Overview</CardTitle>
            <CardDescription>Session telemetry and task focus.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={statusStyles[agent.status]}>
                {agent.status}
              </Badge>
              <Badge variant="outline">{agent.type}</Badge>
              <Badge variant="outline">{agent.model}</Badge>
              <Badge variant="outline">{agent.host}</Badge>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/50 p-4">
              <p className="text-sm font-medium text-foreground">Current task</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {agent.currentTask?.title ?? "No active task assigned."}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Uptime: {formatDuration(agent.startedAt)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm">
                <Pause className="mr-2 h-4 w-4" /> Pause agent
              </Button>
              <Button variant="outline" size="sm">
                <PlayCircle className="mr-2 h-4 w-4" /> Redirect
              </Button>
              <Button variant="secondary" size="sm">
                <Siren className="mr-2 h-4 w-4" /> Escalate to Josh
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Recent Events</CardTitle>
            <CardDescription>Latest activity from the agent stream.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {mockEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-lg border border-border/60 bg-background/50 p-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="uppercase tracking-wide">{event.type}</span>
                  <span className="text-muted-foreground">{event.time}</span>
                </div>
                <p className="mt-2 text-sm text-foreground">{event.summary}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle>Decision Log</CardTitle>
          <CardDescription>Decisions awaiting approval or resolution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mockDecisions.map((decision, index) => (
            <div key={decision.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {decision.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Confidence {decision.confidence}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{decision.outcome}</Badge>
                  <Button variant="outline" size="sm">
                    Review <ArrowRight className="ml-2 h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {index !== mockDecisions.length - 1 && <Separator className="mt-4" />}
            </div>
          ))}

          {mockDecisions.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
              <AlertCircle className="mx-auto mb-2 h-5 w-5" />
              No pending decisions logged for this agent.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
