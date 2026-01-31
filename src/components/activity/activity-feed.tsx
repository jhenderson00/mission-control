"use client";

import { useMemo, useState } from "react";
import { ActivityFilters } from "./activity-filters";
import { ActivityItem } from "./activity-item";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useActivityFeed } from "@/lib/realtime";
import { cn } from "@/lib/utils";

type ActivityFeedProps = {
  limit?: number;
  className?: string;
};

export function ActivityFeed({
  limit = 80,
  className,
}: ActivityFeedProps): JSX.Element {
  const { events, isLoading } = useActivityFeed({ limit });
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");

  const agentIds = useMemo(
    () => Array.from(new Set(events.map((event) => event.agentId))).filter(Boolean),
    [events]
  );

  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((event) => event.type))).filter(Boolean),
    [events]
  );

  const filteredEvents = useMemo(() => {
    return events
      .filter((event) => {
        const agentMatch =
          selectedAgentId === "all" || event.agentId === selectedAgentId;
        const typeMatch = selectedType === "all" || event.type === selectedType;
        return agentMatch && typeMatch;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [events, selectedAgentId, selectedType]);

  const hasFilters = agentIds.length > 0 || eventTypes.length > 0;
  const emptyLabel = hasFilters
    ? "No activity matches the current filters."
    : "No activity events yet.";

  return (
    <Card className={cn("border-border/60 bg-card/40", className)}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Activity Feed</CardTitle>
          <CardDescription>
            Live agent actions and event telemetry, newest first.
          </CardDescription>
        </div>
        <Badge variant="outline">Streaming</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <ActivityFilters
          agentIds={agentIds}
          eventTypes={eventTypes}
          selectedAgentId={selectedAgentId}
          selectedType={selectedType}
          onAgentChange={setSelectedAgentId}
          onTypeChange={setSelectedType}
          isLoading={isLoading}
        />
        <ScrollArea className="h-[420px] pr-3">
          <div className="space-y-3">
            {isLoading && (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                Loading activity feed...
              </div>
            )}
            {!isLoading && filteredEvents.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                {emptyLabel}
              </div>
            )}
            {!isLoading &&
              filteredEvents.map((event) => (
                <ActivityItem key={event._id} event={event} />
              ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
