import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const mockNodes = [
  { label: "Josh Request", type: "origin" },
  { label: "Cydni Plan", type: "decision" },
  { label: "Planner Decision", type: "decision" },
  { label: "Executor Decision", type: "decision" },
  { label: "Critic Review", type: "decision" },
  { label: "Final Output", type: "outcome" },
];

export default function GraphPage() {
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
            Context graph nodes will render here once Convex data is wired.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mockNodes.map((node) => (
              <div
                key={node.label}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-background/50 px-4 py-3"
              >
                <span className="text-sm text-foreground">{node.label}</span>
                <Badge variant="outline">{node.type}</Badge>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 p-6 text-sm text-muted-foreground">
            Connect this panel to Convex decision data to render live edges,
            weights, and reasoning chains.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
