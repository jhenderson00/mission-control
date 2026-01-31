import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ChevronRight,
  Filter,
  GitBranch,
  Search,
  ThumbsDown,
  ThumbsUp,
  Zap,
} from "lucide-react";

// Mock decisions data
const decisions = [
  {
    id: "d_1",
    timestamp: "19:20:44",
    agent: "Claude Code #47",
    task: "PR review #234",
    decision: "Flag potential SQL injection in line 142",
    reasoning: "User input flows to query without sanitization. No explicit bypass comment found.",
    confidence: 0.92,
    outcome: "pending",
    alternatives: [
      { option: "Ignore — might be intentional", rejected: "No explicit bypass comment" },
    ],
  },
  {
    id: "d_2",
    timestamp: "19:15:12",
    agent: "Analyst #12",
    task: "CTO Briefing",
    decision: "Prioritize infrastructure costs over feature requests",
    reasoning: "Q4 data shows 3x increase in cloud spend. Leadership visibility needed.",
    confidence: 0.88,
    outcome: "accepted",
    alternatives: [
      { option: "Lead with feature adoption metrics", rejected: "Lower executive priority" },
    ],
  },
  {
    id: "d_3",
    timestamp: "19:08:33",
    agent: "Writer #3",
    task: "Gartner response",
    decision: "Request additional context before drafting",
    reasoning: "Missing Q4 metrics critical for competitive positioning claims.",
    confidence: 0.95,
    outcome: "accepted",
    alternatives: [],
  },
  {
    id: "d_4",
    timestamp: "18:55:00",
    agent: "Cydni",
    task: "Orchestration",
    decision: "Spawn specialized code reviewer for PR #234",
    reasoning: "Security-focused review requires dedicated agent with code analysis focus.",
    confidence: 0.97,
    outcome: "accepted",
    alternatives: [
      { option: "Route to general-purpose executor", rejected: "Lower security expertise" },
    ],
  },
  {
    id: "d_5",
    timestamp: "18:42:15",
    agent: "Critic #12",
    task: "Review PR #47",
    decision: "Approve with minor suggestions",
    reasoning: "Code quality meets standards. Minor naming convention improvements suggested.",
    confidence: 0.85,
    outcome: "accepted",
    alternatives: [
      { option: "Request changes", rejected: "Issues are stylistic, not functional" },
    ],
  },
];

const outcomeStyles = {
  pending: { color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" },
  accepted: { color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" },
  rejected: { color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20" },
};

function DecisionCard({ decision }: { decision: typeof decisions[0] }) {
  const style = outcomeStyles[decision.outcome as keyof typeof outcomeStyles];

  return (
    <Card className="border-border/40 bg-card/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${style.bg}`}>
              <GitBranch className={`h-5 w-5 ${style.color}`} />
            </div>
            <div>
              <h3 className="text-sm font-medium">{decision.decision}</h3>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>{decision.agent}</span>
                <span>•</span>
                <span>{decision.task}</span>
                <span>•</span>
                <span>{decision.timestamp}</span>
              </div>
            </div>
          </div>
          <Badge variant="outline" className={`${style.color} ${style.border} capitalize`}>
            {decision.outcome}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Reasoning */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Reasoning</p>
          <p className="text-sm">{decision.reasoning}</p>
        </div>

        {/* Confidence */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">Confidence</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full"
                  style={{ width: `${decision.confidence * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium">{Math.round(decision.confidence * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Alternatives */}
        {decision.alternatives.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Alternatives considered</p>
            <div className="space-y-2">
              {decision.alternatives.map((alt, i) => (
                <div key={i} className="rounded-md bg-muted/20 p-2 text-xs">
                  <p className="text-foreground">{alt.option}</p>
                  <p className="text-muted-foreground mt-0.5">
                    Rejected: {alt.rejected}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions for pending decisions */}
        {decision.outcome === "pending" && (
          <div className="flex items-center gap-2 pt-2">
            <Button size="sm" variant="outline" className="gap-2 flex-1">
              <ThumbsUp className="h-4 w-4" />
              Accept
            </Button>
            <Button size="sm" variant="outline" className="gap-2 flex-1">
              <ThumbsDown className="h-4 w-4" />
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function GraphPage() {
  const pendingDecisions = decisions.filter((d) => d.outcome === "pending");
  const resolvedDecisions = decisions.filter((d) => d.outcome !== "pending");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Context Graph"
        description="Traceable decisions and reasoning chains across your AI organization"
        badge="Decisions"
      />

      {/* Search and filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search decisions, reasoning..." className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" />
            Filter
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card className="border-border/40 bg-card/30">
          <CardContent className="pt-4">
            <p className="text-2xl font-semibold">{decisions.length}</p>
            <p className="text-xs text-muted-foreground">Total decisions</p>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/30">
          <CardContent className="pt-4">
            <p className="text-2xl font-semibold text-amber-400">{pendingDecisions.length}</p>
            <p className="text-xs text-muted-foreground">Pending review</p>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/30">
          <CardContent className="pt-4">
            <p className="text-2xl font-semibold text-emerald-400">91%</p>
            <p className="text-xs text-muted-foreground">Avg confidence</p>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/30">
          <CardContent className="pt-4">
            <p className="text-2xl font-semibold">4</p>
            <p className="text-xs text-muted-foreground">Decision chains</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Decision list */}
        <div className="space-y-6">
          {/* Pending */}
          {pendingDecisions.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Pending Review ({pendingDecisions.length})
              </h3>
              <div className="space-y-4">
                {pendingDecisions.map((decision) => (
                  <DecisionCard key={decision.id} decision={decision} />
                ))}
              </div>
            </section>
          )}

          {/* Resolved */}
          <section>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-zinc-400" />
              Recent Decisions ({resolvedDecisions.length})
            </h3>
            <div className="space-y-4">
              {resolvedDecisions.map((decision) => (
                <DecisionCard key={decision.id} decision={decision} />
              ))}
            </div>
          </section>
        </div>

        {/* Graph visualization placeholder */}
        <div className="space-y-4">
          <Card className="border-border/40 bg-card/30">
            <CardHeader>
              <CardTitle className="text-sm">Decision Tree</CardTitle>
              <CardDescription>Visual graph coming soon</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="aspect-square rounded-lg border border-dashed border-border/40 bg-muted/10 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Interactive graph</p>
                  <p className="text-xs">visualization</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-card/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Quick Search</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                "Why did agent X choose Y?",
                "Decisions about security",
                "Low confidence decisions",
                "Decisions by Cydni",
              ].map((query, i) => (
                <Button
                  key={i}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground hover:text-foreground"
                >
                  <Search className="h-3 w-3 mr-2" />
                  {query}
                  <ChevronRight className="h-3 w-3 ml-auto" />
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
