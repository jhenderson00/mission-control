import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function GraphPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Context Graph"
        description="Visualize dependencies, signals, and relationships across your AI org."
        badge="Graph"
      />

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Graph View</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Placeholder for interactive graph visualization. Connect this panel to
          Convex data to render live node/edge activity.
        </CardContent>
      </Card>
    </div>
  );
}
