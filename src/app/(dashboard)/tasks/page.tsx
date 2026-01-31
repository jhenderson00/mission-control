import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const tasks = [
  {
    title: "Synchronize context graph",
    owner: "Noah Flux",
    status: "active",
    priority: "critical",
    detail: "Indexing 14 new dependencies across task chain.",
  },
  {
    title: "Review decision packet: Delta",
    owner: "Lena Quartz",
    status: "queued",
    priority: "high",
    detail: "Awaiting alignment on escalation thresholds.",
  },
  {
    title: "Rebalance agent workloads",
    owner: "Sol Reyes",
    status: "queued",
    priority: "medium",
    detail: "Drafting redistribution across NA pods.",
  },
  {
    title: "Audit event anomalies",
    owner: "Ava Meridian",
    status: "blocked",
    priority: "high",
    detail: "Missing telemetry from Tank node; waiting on infra.",
  },
];

const statusBadge: Record<string, "secondary" | "outline"> = {
  active: "secondary",
  queued: "outline",
  blocked: "outline",
};

export default function TasksPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Task Queue"
        description="Monitor active missions, blockers, and escalations across the fleet."
        badge="Queue"
      />

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle>Mission Pipeline</CardTitle>
          <CardDescription>Queued and active tasks for today.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {tasks.map((task, index) => (
            <div key={task.title}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {task.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Owner: {task.owner}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusBadge[task.status] ?? "outline"}>
                    {task.status}
                  </Badge>
                  <Badge variant="outline">{task.priority}</Badge>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {task.detail}
              </p>
              {index !== tasks.length - 1 && <Separator className="mt-4" />}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
