"use client";

import { useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/dashboard/page-header";
import { ConversationView } from "@/components/conversation/conversation-view";
import { formatDuration, formatRelativeTime } from "@/lib/format";
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
import { mockAgents } from "@/lib/mock-data";
import { useAgentStatus, useConversation } from "@/lib/realtime";
import {
  AlertCircle,
  ArrowRight,
  Pause,
  PlayCircle,
  Siren,
} from "lucide-react";

const fallbackEvents = [
  {
    id: "event_1",
    createdAt: Date.now() - 2 * 60 * 1000,
    type: "tool_call",
    content: "read_file(\"src/api/routes.ts\")",
  },
  {
    id: "event_2",
    createdAt: Date.now() - 7 * 60 * 1000,
    type: "message",
    content: "Flagged potential SQL injection in PR #234",
  },
  {
    id: "event_3",
    createdAt: Date.now() - 12 * 60 * 1000,
    type: "tool_result",
    content: "npm test → 47 passed, 0 failed",
  },
];

const fallbackDecisions = [
  {
    id: "decision_1",
    decision: "Escalate SQL injection risk",
    confidence: 0.92,
    outcome: "pending",
  },
  {
    id: "decision_2",
    decision: "Request human approval on release note",
    confidence: 0.78,
    outcome: "pending",
  },
];

const statusStyles: Record<string, string> = {
  active: "bg-primary/15 text-primary",
  idle: "bg-muted text-muted-foreground",
  blocked: "bg-amber-400/15 text-amber-300",
  failed: "bg-red-500/15 text-red-300",
};

type EventItem = {
  id?: string;
  _id?: string;
  type: string;
  content: string;
  createdAt?: number;
};

type DecisionItem = {
  id?: string;
  _id?: string;
  decision: string;
  confidence?: number;
  outcome: string;
};

export default function AgentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  const agentId = params.id as Id<"agents">;

  const agent = useQuery(api.agents.get, { id: agentId });
  const events = useQuery(api.events.listByAgent, { agentId });
  const decisions = useQuery(api.decisions.listByAgent, { agentId });
  const { statusByAgent } = useAgentStatus({ agentIds: [agentId] });
  const currentTask = useQuery(
    api.tasks.get,
    !hasConvex || !agent?.currentTaskId
      ? "skip"
      : { id: agent.currentTaskId }
  );

  const fallbackAgent =
    mockAgents.find((item) => item._id === params.id) ?? mockAgents[0];

  const isLoadingAgent = hasConvex && agent === undefined;
  const agentData = hasConvex ? agent : fallbackAgent;
  const liveStatus = statusByAgent.get(agentId);
  const sessionKey = liveStatus?.currentSession ?? agentData?.sessionId;
  const conversation = useConversation(sessionKey, { limit: 200 });

  const isLoadingEvents = hasConvex && events === undefined;
  const eventList: EventItem[] = hasConvex ? events ?? [] : fallbackEvents;

  const isLoadingDecisions = hasConvex && decisions === undefined;
  const decisionList: DecisionItem[] = hasConvex
    ? decisions ?? []
    : fallbackDecisions;

  if (isLoadingAgent) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Agent"
          description="Loading agent telemetry..."
          badge="Loading"
        />
        <Card className="border-border/60 bg-card/40">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Pulling agent status and decision logs.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!agentData) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Agent not found"
          description="We couldn't locate this agent in Convex."
          badge="Missing"
        />
        <Card className="border-border/60 bg-card/40">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Check the agent ID and try again.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={agentData.name}
        description={`Model ${agentData.model} · ${agentData.host.toUpperCase()} node`}
        badge={agentData.status === "active" ? "Live" : agentData.status}
      />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Agent Overview</CardTitle>
            <CardDescription>Session telemetry and task focus.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={statusStyles[agentData.status] ?? ""}
              >
                {agentData.status}
              </Badge>
              <Badge variant="outline">{agentData.type}</Badge>
              <Badge variant="outline">{agentData.model}</Badge>
              <Badge variant="outline">{agentData.host}</Badge>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/50 p-4">
              <p className="text-sm font-medium text-foreground">Current task</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasConvex
                  ? currentTask?.title ?? "No active task assigned."
                  : agentData.currentTask?.title ?? "No active task assigned."}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Uptime: {formatDuration(agentData.startedAt, "Idle")}
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
            {isLoadingEvents && (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                Loading events...
              </div>
            )}
            {!isLoadingEvents && eventList.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                No events logged for this agent yet.
              </div>
            )}
            {!isLoadingEvents &&
              eventList.map((event) => (
                <div
                  key={event.id ?? event._id}
                  className="rounded-lg border border-border/60 bg-background/50 p-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="uppercase tracking-wide">
                      {event.type}
                    </span>
                    <span className="text-muted-foreground">
                      {formatRelativeTime(event.createdAt, "just now")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-foreground">
                    {event.content}
                  </p>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <ConversationView
        messages={conversation.messages}
        isLoading={conversation.isLoading}
        isStreaming={conversation.isStreaming}
        sessionKey={sessionKey}
      />

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle>Decision Log</CardTitle>
          <CardDescription>Decisions awaiting approval or resolution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingDecisions && (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
              Loading decisions...
            </div>
          )}
          {!isLoadingDecisions &&
            decisionList.map((decision, index) => (
              <div key={decision.id ?? decision._id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {decision.decision}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Confidence {decision.confidence?.toFixed(2) ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{decision.outcome}</Badge>
                    <Button variant="outline" size="sm">
                      Review <ArrowRight className="ml-2 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {index !== decisionList.length - 1 && (
                  <Separator className="mt-4" />
                )}
              </div>
            ))}

          {!isLoadingDecisions && decisionList.length === 0 && (
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
