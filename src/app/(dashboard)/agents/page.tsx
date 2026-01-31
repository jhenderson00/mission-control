import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const agents = [
  {
    name: "Ava Meridian",
    role: "Operations Lead",
    status: "Active",
    focus: "Incident response",
  },
  {
    name: "Noah Flux",
    role: "Context Architect",
    status: "Active",
    focus: "Knowledge graph",
  },
  {
    name: "Lena Quartz",
    role: "Decision Strategist",
    status: "Standby",
    focus: "Escalation triage",
  },
  {
    name: "Sol Reyes",
    role: "Task Orchestrator",
    status: "Active",
    focus: "Pipeline automation",
  },
];

export default function AgentsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Agents"
        description="Track your autonomous operators, their roles, and current mission focus."
        badge="Roster"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search agents, roles, missions"
          className="max-w-sm"
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>4 online</span>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        {agents.map((agent) => (
          <Card key={agent.name} className="border-border/60 bg-card/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{agent.name}</CardTitle>
                <Badge
                  variant={agent.status === "Active" ? "secondary" : "outline"}
                >
                  {agent.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{agent.role}</p>
              <p>Focus: {agent.focus}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
