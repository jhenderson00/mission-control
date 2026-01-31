"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
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

const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

const fallbackTasks = [
  {
    id: "task_1",
    title: "Synchronize context graph",
    owner: "Noah Flux",
    status: "active",
    priority: "critical",
    detail: "Indexing 14 new dependencies across task chain.",
  },
  {
    id: "task_2",
    title: "Review decision packet: Delta",
    owner: "Lena Quartz",
    status: "queued",
    priority: "high",
    detail: "Awaiting alignment on escalation thresholds.",
  },
  {
    id: "task_3",
    title: "Rebalance agent workloads",
    owner: "Sol Reyes",
    status: "queued",
    priority: "medium",
    detail: "Drafting redistribution across NA pods.",
  },
  {
    id: "task_4",
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
  completed: "outline",
  failed: "outline",
};

export default function TasksPage() {
  const tasks = useQuery(api.tasks.listWithAgents, { limit: 12 });

  const isLoading = hasConvex && tasks === undefined;

  const taskList = !hasConvex
    ? fallbackTasks
    : tasks?.map((task) => ({
        id: task._id ?? task.title,
        title: task.title,
        owner: task.assignedAgents?.[0]?.name ?? task.requester ?? "Unassigned",
        status: task.status,
        priority: task.priority,
        detail:
          task.description ?? task.blockedReason ?? "No details provided yet.",
      })) ?? [];

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
          {isLoading && (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
              Loading task pipeline...
            </div>
          )}
          {!isLoading && taskList.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
              No tasks in the queue yet.
            </div>
          )}
          {!isLoading &&
            taskList.map((task, index) => (
              <div key={task.id}>
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
                {index !== taskList.length - 1 && (
                  <Separator className="mt-4" />
                )}
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
