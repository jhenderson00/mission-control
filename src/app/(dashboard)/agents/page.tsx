"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/dashboard/page-header";
import { AgentStatusGrid } from "@/components/dashboard/agent-status-grid";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { allMockAgents } from "@/lib/mock-data";
import type { AgentSummary } from "@/lib/agent-types";

export default function AgentsPage() {
  const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  const agents = useQuery(api.agents.listWithTasks, {});
  const presenceCounts = useQuery(api.agents.presenceCounts, {});

  const isLoading = hasConvex && agents === undefined;
  const agentList: AgentSummary[] = hasConvex ? agents ?? [] : allMockAgents;

  const onlineCount = isLoading
    ? null
    : presenceCounts?.active ??
      agentList.filter((agent) => agent.status === "active").length;
  const totalCount = isLoading
    ? null
    : presenceCounts?.total ?? agentList.length;

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
          <span>{onlineCount ?? "—"} online</span>
          <Badge variant="outline">{totalCount ?? "—"} total</Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
          Loading agents...
        </div>
      ) : (
        <AgentStatusGrid agents={agentList} />
      )}
    </div>
  );
}
