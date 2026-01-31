import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  User,
  XCircle,
} from "lucide-react";
import Link from "next/link";

type TaskStatus = "queued" | "active" | "blocked" | "completed" | "failed";
type Priority = "critical" | "high" | "medium" | "low";

interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  requester: "josh" | "cydni" | "system";
  assignedAgent?: string;
  createdAt: string;
  blockedReason?: string;
}

const tasks: Task[] = [
  {
    id: "task_1",
    title: "PR review for tezadmin.web #234",
    description: "Security-focused review of authentication changes",
    status: "active",
    priority: "high",
    requester: "josh",
    assignedAgent: "Claude Code #47",
    createdAt: "12m ago",
  },
  {
    id: "task_2",
    title: "CTO Briefing synthesis",
    description: "Compile insights from Q4 support trends",
    status: "active",
    priority: "high",
    requester: "cydni",
    assignedAgent: "Analyst #12",
    createdAt: "25m ago",
  },
  {
    id: "task_3",
    title: "Draft response to Gartner inquiry",
    description: "Prepare technical details for analyst review",
    status: "blocked",
    priority: "medium",
    requester: "josh",
    assignedAgent: "Writer #3",
    createdAt: "1h ago",
    blockedReason: "Waiting for Q4 metrics from analytics team",
  },
  {
    id: "task_4",
    title: "Review PR #47 code quality",
    status: "active",
    priority: "medium",
    requester: "system",
    assignedAgent: "Critic #12",
    createdAt: "8m ago",
  },
  {
    id: "task_5",
    title: "Update deployment documentation",
    status: "queued",
    priority: "low",
    requester: "cydni",
    createdAt: "2h ago",
  },
  {
    id: "task_6",
    title: "Analyze Q4 support ticket patterns",
    status: "queued",
    priority: "medium",
    requester: "josh",
    createdAt: "3h ago",
  },
  {
    id: "task_7",
    title: "Security audit: API endpoints",
    description: "Comprehensive review of all public endpoints",
    status: "completed",
    priority: "critical",
    requester: "josh",
    assignedAgent: "Claude Code #45",
    createdAt: "Yesterday",
  },
  {
    id: "task_8",
    title: "Refactor notification service",
    status: "failed",
    priority: "medium",
    requester: "cydni",
    assignedAgent: "Claude Code #44",
    createdAt: "Yesterday",
  },
];

const statusConfig: Record<
  TaskStatus,
  { icon: typeof CheckCircle2; color: string; bgColor: string }
> = {
  active: { icon: Play, color: "text-emerald-400", bgColor: "bg-emerald-400/10" },
  queued: { icon: Clock, color: "text-blue-400", bgColor: "bg-blue-400/10" },
  blocked: { icon: AlertCircle, color: "text-amber-400", bgColor: "bg-amber-400/10" },
  completed: { icon: CheckCircle2, color: "text-zinc-400", bgColor: "bg-zinc-400/10" },
  failed: { icon: XCircle, color: "text-red-400", bgColor: "bg-red-400/10" },
};

const priorityColors: Record<Priority, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/30",
  high: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  medium: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  low: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
};

function TaskCard({ task }: { task: Task }) {
  const config = statusConfig[task.status];
  const StatusIcon = config.icon;

  return (
    <Card className="border-border/40 bg-card/30 hover:bg-card/50 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.bgColor}`}>
              <StatusIcon className={`h-4 w-4 ${config.color}`} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium truncate">{task.title}</h3>
              {task.description && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {task.description}
                </p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {task.blockedReason && (
          <div className="mb-3 rounded-md bg-amber-500/10 border border-amber-500/20 p-2 text-xs text-amber-300">
            <AlertCircle className="h-3 w-3 inline mr-1" />
            {task.blockedReason}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={priorityColors[task.priority]}>
            {task.priority}
          </Badge>
          <Badge variant="outline" className="capitalize">
            {task.status}
          </Badge>
          {task.assignedAgent && (
            <Badge variant="secondary" className="gap-1">
              <User className="h-3 w-3" />
              {task.assignedAgent}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {task.createdAt}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TasksPage() {
  const activeTasks = tasks.filter((t) => t.status === "active");
  const blockedTasks = tasks.filter((t) => t.status === "blocked");
  const queuedTasks = tasks.filter((t) => t.status === "queued");
  const completedTasks = tasks.filter((t) => t.status === "completed" || t.status === "failed");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Task Queue"
        description="Monitor active missions, blockers, and escalations across the fleet"
        badge="Operations"
      />

      {/* Search and filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search tasks..." className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" />
            Filter
          </Button>
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Create Task
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card className="border-border/40 bg-card/30">
          <CardContent className="pt-4">
            <p className="text-2xl font-semibold text-emerald-400">{activeTasks.length}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/30">
          <CardContent className="pt-4">
            <p className="text-2xl font-semibold text-amber-400">{blockedTasks.length}</p>
            <p className="text-xs text-muted-foreground">Blocked</p>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/30">
          <CardContent className="pt-4">
            <p className="text-2xl font-semibold text-blue-400">{queuedTasks.length}</p>
            <p className="text-xs text-muted-foreground">Queued</p>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/30">
          <CardContent className="pt-4">
            <p className="text-2xl font-semibold">{completedTasks.length}</p>
            <p className="text-xs text-muted-foreground">Completed today</p>
          </CardContent>
        </Card>
      </div>

      {/* Task sections */}
      <div className="space-y-6">
        {/* Active */}
        {activeTasks.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Active ({activeTasks.length})
            </h3>
            <div className="space-y-3">
              {activeTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </section>
        )}

        {/* Blocked */}
        {blockedTasks.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Blocked ({blockedTasks.length})
            </h3>
            <div className="space-y-3">
              {blockedTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </section>
        )}

        {/* Queued */}
        {queuedTasks.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              Queued ({queuedTasks.length})
            </h3>
            <div className="space-y-3">
              {queuedTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </section>
        )}

        {/* Completed/Failed */}
        {completedTasks.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-zinc-400" />
              Completed ({completedTasks.length})
            </h3>
            <div className="space-y-3">
              {completedTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
