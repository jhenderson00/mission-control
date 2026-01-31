import { PageHeader } from "@/components/dashboard/page-header";
import { AgentStatusGrid } from "@/components/dashboard/agent-status-grid";
import { allMockAgents } from "@/lib/mock-data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, Plus, Filter } from "lucide-react";

export default function AgentsPage() {
  const activeCount = allMockAgents.filter((a) => a.status === "active").length;
  const totalCount = allMockAgents.length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Agents"
        description="Track your autonomous operators, their roles, and current mission focus"
        badge="Fleet"
      />

      {/* Search and filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search agents, roles, tasks..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" />
            Filter
          </Button>
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Spawn Agent
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card className="border-border/40 bg-card/30">
          <CardContent className="pt-4">
            <p className="text-2xl font-semibold">{totalCount}</p>
            <p className="text-xs text-muted-foreground">Total agents</p>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/30">
          <CardContent className="pt-4">
            <p className="text-2xl font-semibold text-emerald-400">{activeCount}</p>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/30">
          <CardContent className="pt-4">
            <p className="text-2xl font-semibold">2</p>
            <p className="text-xs text-muted-foreground">Hosts online</p>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/30">
          <CardContent className="pt-4">
            <p className="text-2xl font-semibold">3</p>
            <p className="text-xs text-muted-foreground">Agent types</p>
          </CardContent>
        </Card>
      </div>

      {/* Agent grid */}
      <AgentStatusGrid agents={allMockAgents} />

      {/* Agent types legend */}
      <Card className="border-border/40 bg-card/20">
        <CardHeader>
          <CardTitle className="text-sm">Agent Types</CardTitle>
          <CardDescription>
            Role definitions in the AI organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                type: "Coordinator",
                description: "Orchestrates multi-agent workflows",
              },
              {
                type: "Planner",
                description: "Breaks down tasks, creates strategies",
              },
              {
                type: "Executor",
                description: "Performs the actual work",
              },
              {
                type: "Critic",
                description: "Reviews and validates outputs",
              },
              {
                type: "Specialist",
                description: "Domain-specific expertise",
              },
            ].map((item) => (
              <div key={item.type} className="space-y-1">
                <Badge variant="outline" className="text-xs">
                  {item.type}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
