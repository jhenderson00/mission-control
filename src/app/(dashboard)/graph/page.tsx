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

const fallbackNodes = [
  { id: "node_1", label: "Josh Request", type: "origin" },
  { id: "node_2", label: "Cydni Plan", type: "decision" },
  { id: "node_3", label: "Planner Decision", type: "decision" },
  { id: "node_4", label: "Executor Decision", type: "decision" },
  { id: "node_5", label: "Critic Review", type: "decision" },
  { id: "node_6", label: "Final Output", type: "outcome" },
];

type GraphNode = {
  id: string;
  label: string;
  type: string;
};

type DecisionNodeSource = {
  _id?: string;
  decision: string;
  outcome: string;
};

export default function GraphPage() {
  const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  const decisions = useQuery(api.decisions.listRecent, { limit: 12 });

  const isLoading = hasConvex && decisions === undefined;

  const nodes: GraphNode[] = !hasConvex
    ? fallbackNodes
    : (decisions ?? []).map((decision: DecisionNodeSource) => ({
        id: decision._id ?? decision.decision,
        label: decision.decision,
        type: decision.outcome,
      }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Context Graph"
        description="Visualize dependencies, signals, and reasoning across your AI org."
        badge="Graph"
      />

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle>Graph View</CardTitle>
          <CardDescription>
            Context graph nodes render from live Convex decision data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && (
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 p-6 text-sm text-muted-foreground">
              Loading graph nodes...
            </div>
          )}
          {!isLoading && nodes.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 p-6 text-sm text-muted-foreground">
              No decision nodes available yet.
            </div>
          )}
          {!isLoading && nodes.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {nodes.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-background/50 px-4 py-3"
                >
                  <span className="text-sm text-foreground truncate">
                    {node.label}
                  </span>
                  <Badge variant="outline">{node.type}</Badge>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 p-6 text-sm text-muted-foreground">
            Connect this panel to Convex decision data to render live edges,
            weights, and reasoning chains.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
