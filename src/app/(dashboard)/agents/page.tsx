import { PageHeader } from "@/components/dashboard/page-header";
import { AgentStatusGrid } from "@/components/dashboard/agent-status-grid";
import { allMockAgents } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const onlineCount = allMockAgents.filter((agent) => agent.status === "active").length;

export default function AgentsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Agents"
        description="Track autonomous operators, their roles, and mission focus across the fleet."
        badge="Active"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search agents, roles, missions"
          className="max-w-sm"
        />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span>{onlineCount} active</span>
          <Badge variant="outline">{allMockAgents.length} total</Badge>
        </div>
      </div>

      <AgentStatusGrid agents={allMockAgents} />
    </div>
  );
}
