import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const tasks = [
  {
    title: "Synchronize context graph",
    owner: "Noah Flux",
    status: "In Progress",
    priority: "Critical",
  },
  {
    title: "Review decision packet: Delta",
    owner: "Lena Quartz",
    status: "Pending",
    priority: "High",
  },
  {
    title: "Rebalance agent workloads",
    owner: "Sol Reyes",
    status: "Queued",
    priority: "Medium",
  },
  {
    title: "Audit event anomalies",
    owner: "Ava Meridian",
    status: "Blocked",
    priority: "High",
  },
];

export default function TasksPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Task Queue"
        description="Monitor active missions, blockers, and escalations across the fleet."
        badge="Operations"
      />

      <section className="space-y-4">
        {tasks.map((task) => (
          <Card key={task.title} className="border-border/60 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{task.title}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{task.status}</Badge>
                <Badge variant="outline">{task.priority}</Badge>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Owner: {task.owner}
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
