import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const stream = [
  {
    timestamp: "09:12",
    message: "Validated task dependencies for Mission Delta.",
  },
  {
    timestamp: "09:18",
    message: "Flagged anomaly in context graph (node drift: 6%).",
  },
  {
    timestamp: "09:24",
    message: "Escalated decision packet to Operations Lead.",
  },
  {
    timestamp: "09:31",
    message: "Sync complete. Awaiting next directive.",
  },
];

type AgentDetailPageProps = {
  params: {
    id: string;
  };
};

export default function AgentDetailPage({ params }: AgentDetailPageProps) {
  return (
    <div className="space-y-8">
      <PageHeader
        title={`Agent ${params.id}`}
        description="Conversation stream and mission telemetry."
        badge="Live"
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Conversation Stream</CardTitle>
            <CardDescription>
              Real-time agent dialogue and system reflections.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ScrollArea className="h-64 rounded-xl border border-border/50 bg-background/40 p-4">
              <div className="space-y-4">
                {stream.map((entry) => (
                  <div
                    key={entry.timestamp}
                    className="rounded-lg border border-border/40 bg-muted/30 p-3"
                  >
                    <p className="text-xs text-muted-foreground">
                      {entry.timestamp}
                    </p>
                    <p className="text-sm text-foreground">{entry.message}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex items-center gap-3">
              <Input placeholder="Send directive or request..." />
              <Badge variant="secondary">Queued</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Agent Brief</CardTitle>
            <CardDescription>Current objectives & status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Status</p>
              <p className="text-sm text-foreground">Active • High priority</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Focus</p>
              <p>Context stabilization and routing governance.</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Next sync</p>
              <p>In 12 minutes</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
