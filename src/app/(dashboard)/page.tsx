import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Mission Overview"
        description="Command the organization, align missions, and monitor real-time signals."
        badge="Command"
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: "Active Agents",
            value: "12",
            detail: "3 on standby",
          },
          {
            title: "Open Tasks",
            value: "27",
            detail: "8 blocked",
          },
          {
            title: "Critical Events",
            value: "4",
            detail: "Last 24h",
          },
          {
            title: "Decisions Pending",
            value: "6",
            detail: "Awaiting approval",
          },
        ].map((stat) => (
          <Card key={stat.title} className="border-border/60 bg-card/60">
            <CardHeader className="space-y-1">
              <CardDescription>{stat.title}</CardDescription>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {stat.detail}
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle>Mission Pulse</CardTitle>
          <CardDescription>
            Live snapshots across operations, context, and decisions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="operations" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="operations">Operations</TabsTrigger>
              <TabsTrigger value="context">Context</TabsTrigger>
              <TabsTrigger value="decisions">Decisions</TabsTrigger>
            </TabsList>
            <TabsContent value="operations" className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary">North America</Badge>
                <Badge variant="secondary">EMEA</Badge>
                <Badge variant="outline">APAC</Badge>
              </div>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Signal integrity</p>
                  <p className="text-xs text-muted-foreground">
                    Routing 48k events/hour across mission nodes.
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Automation coverage</p>
                  <p className="text-xs text-muted-foreground">
                    71% tasks auto-routed with escalation guards.
                  </p>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="context" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Context graph sync is enabled. 14 new dependencies detected in
                the last cycle.
              </p>
            </TabsContent>
            <TabsContent value="decisions" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Decision queue stabilized with two priority escalations waiting
                on executive review.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
