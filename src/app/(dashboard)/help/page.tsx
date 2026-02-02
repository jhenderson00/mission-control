import type { ReactElement } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
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
  Activity,
  LayoutDashboard,
  Sliders,
  ShieldCheck,
  Users,
} from "lucide-react";

type FeatureDoc = {
  title: string;
  description: string;
  bullets: string[];
  badge: string;
  icon: typeof LayoutDashboard;
};

type QuickRef = {
  title: string;
  items: string[];
  badge: string;
};

const overviewHighlights = [
  {
    title: "Real-time visibility",
    description:
      "Monitor live agent status, task queues, and decisions as they change.",
  },
  {
    title: "Control with context",
    description:
      "Pause, redirect, or restart agents with audit-tracked commands.",
  },
  {
    title: "Decision confidence",
    description:
      "Trace critical actions and system outcomes in the audit trail.",
  },
];

const gettingStartedSteps = [
  {
    title: "Verify connectivity",
    description:
      "Confirm the connection badge reads Connected. If not, check the Convex setup or wait for sync.",
  },
  {
    title: "Scan Mission Overview",
    description:
      "Use the top stats to gauge agent load, queued tasks, and critical alerts.",
  },
  {
    title: "Review agent posture",
    description:
      "Open the Agents view to see who is active, idle, blocked, or failed.",
  },
  {
    title: "Respond to signals",
    description:
      "Use the Control Panel to pause, redirect, or reprioritize in-flight work.",
  },
  {
    title: "Verify outcomes",
    description:
      "Check the Audit Log for accepted or rejected commands and timestamps.",
  },
];

const featureDocs: FeatureDoc[] = [
  {
    title: "Dashboard",
    description: "Your live overview of fleet health and urgent decisions.",
    bullets: [
      "Stat tiles summarize active agents, queued tasks, pending decisions, and alerts.",
      "Agent Status Grid shows roles, current task, runtime, and selection actions.",
      "Mission Pulse highlights the latest system events and telemetry.",
      "Critical Queue surfaces decisions and blockers waiting on you.",
    ],
    badge: "Overview",
    icon: LayoutDashboard,
  },
  {
    title: "Agent Status",
    description: "Interpret badges, colors, and presence at a glance.",
    bullets: [
      "Active (coral) means the agent is executing a task right now.",
      "Idle (gray) indicates availability with no current task.",
      "Blocked (amber) flags dependency or external wait states.",
      "Failed (red) marks errors that need attention.",
      "Heartbeat badges appear only for offline or paused states.",
    ],
    badge: "Statuses",
    icon: Users,
  },
  {
    title: "Control Panel",
    description: "Dispatch commands and override priorities with audit trails.",
    bullets: [
      "Pause / Resume: halt or restart execution; add an optional reason.",
      "Redirect: send the agent to a new task with optional payload and priority.",
      "Priority override: temporarily raise or lower urgency with a duration.",
      "Kill / Restart: destructive controls that require typed confirmation.",
    ],
    badge: "Controls",
    icon: Sliders,
  },
  {
    title: "Activity Feed",
    description: "Filter telemetry by agent and event type to isolate signals.",
    bullets: [
      "Filter by agent to follow a single operator or team.",
      "Filter by event type to isolate decisions, actions, or errors.",
      "Newest events appear first; scroll to review earlier activity.",
    ],
    badge: "Telemetry",
    icon: Activity,
  },
  {
    title: "Audit Log",
    description: "Understand the full control trail for every agent.",
    bullets: [
      "Each entry lists the command, requester, and relative timestamp.",
      "Outcome badges show accepted, rejected, or error results.",
      "Use the log to confirm actions and diagnose issues.",
    ],
    badge: "Compliance",
    icon: ShieldCheck,
  },
];

const quickReference: QuickRef[] = [
  {
    title: "Keyboard shortcuts",
    badge: "Shortcuts",
    items: [
      "Ctrl/Cmd + A selects all agents in the Agent Status Grid.",
      "Esc clears the current agent selection (Dashboard or Agents view).",
    ],
  },
  {
    title: "Common workflows",
    badge: "Workflows",
    items: [
      "Morning triage: review Mission Overview, Mission Pulse, then Critical Queue.",
      "Agent intervention: pause or redirect, then confirm results in Audit Log.",
      "Incident review: filter Activity Feed by agent and event type to trace impact.",
    ],
  },
  {
    title: "Troubleshooting",
    badge: "Support",
    items: [
      "Missing data: clear filters and check the connection badge for sync warnings.",
      "Controls disabled: ensure Convex is connected and controls are deployed.",
      "Stale telemetry: wait for syncing to complete or refresh the session.",
    ],
  },
];

const quickLinks = [
  { href: "/", label: "Mission Overview" },
  { href: "/agents", label: "Agents" },
  { href: "/tasks", label: "Tasks" },
  { href: "/activity", label: "Activity" },
  { href: "/graph", label: "Context Graph" },
];

export default function HelpPage(): ReactElement {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Help & Feature Guide"
        description="Mission Control documentation for operators, analysts, and mission leads."
        badge="Docs"
      />

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="relative overflow-hidden border-border/60 bg-card/40">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,120,90,0.18),_transparent_60%)]" />
          <CardHeader className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Overview</Badge>
              <Badge variant="outline">Mission Control</Badge>
            </div>
            <CardTitle className="text-2xl font-semibold font-display">
              Command the fleet with clarity
            </CardTitle>
            <CardDescription>
              Mission Control is the real-time command center for AI operations - track
              agents, align priorities, and intervene with confidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="relative space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              {overviewHighlights.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-border/60 bg-background/40 p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.title}
                  </p>
                  <p className="mt-2 text-sm text-foreground">{item.description}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Quick links
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {quickLinks.map((link) => (
                  <Button
                    key={link.href}
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-11 border-border/60 px-4 sm:h-8 sm:px-3"
                  >
                    <Link href={link.href}>{link.label}</Link>
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <Badge variant="secondary">Getting started</Badge>
            <CardTitle>First 10 minutes</CardTitle>
            <CardDescription>
              The fastest path to a fully visible, responsive mission.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {gettingStartedSteps.map((step, index) => (
              <div
                key={step.title}
                className="flex gap-3 rounded-xl border border-border/60 bg-background/40 p-3"
              >
                <Badge variant="outline" className="h-6 w-6 justify-center px-0">
                  {index + 1}
                </Badge>
                <div>
                  <p className="text-sm font-medium text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold font-display">Feature docs</h2>
            <p className="text-sm text-muted-foreground">
              Understand each control surface and how to interpret its signals.
            </p>
          </div>
          <Badge variant="outline">Updated for current release</Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {featureDocs.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="border-border/60 bg-card/40">
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{feature.badge}</Badge>
                      <Badge variant="outline">Guide</Badge>
                    </div>
                    <CardTitle className="mt-2 text-lg">{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-muted-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <Separator className="bg-border/60" />
                  <ul className="space-y-2">
                    {feature.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {quickReference.map((ref) => (
          <Card key={ref.title} className="border-border/60 bg-card/40">
            <CardHeader>
              <Badge variant="secondary">{ref.badge}</Badge>
              <CardTitle>{ref.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <Separator className="bg-border/60" />
              <ul className="space-y-2">
                {ref.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
