"use client";

import type { Doc } from "@/convex/_generated/dataModel";
import { formatRelativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type PendingOperationsProps = {
  operations: Array<Doc<"agentControlOperations">>;
  isLoading: boolean;
};

const statusStyles: Record<
  Doc<"agentControlOperations">["status"],
  { label: string; className: string }
> = {
  queued: { label: "Queued", className: "text-amber-300 bg-amber-400/10" },
  sent: { label: "Sent", className: "text-blue-300 bg-blue-400/10" },
  acked: { label: "Acked", className: "text-emerald-300 bg-emerald-400/10" },
  failed: { label: "Failed", className: "text-red-300 bg-red-400/10" },
  "timed-out": { label: "Timed out", className: "text-red-300 bg-red-400/10" },
};

export function PendingOperations({
  operations,
  isLoading,
}: PendingOperationsProps): React.ReactElement {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle>Pending Operations</CardTitle>
        <CardDescription>Live control commands awaiting resolution.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        {isLoading && (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
            Loading operations...
          </div>
        )}

        {!isLoading && operations.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
            <AlertCircle className="mx-auto mb-2 h-5 w-5" />
            No pending operations for this agent.
          </div>
        )}

        {!isLoading &&
          operations.map((operation) => {
            const status = statusStyles[operation.status];
            return (
              <div
                key={operation._id}
                className="rounded-lg border border-border/60 bg-background/50 p-3"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-foreground">
                    {operation.command}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] uppercase", status.className)}
                  >
                    {status.label}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRelativeTime(operation.requestedAt, "just now")}
                  </span>
                  <span>·</span>
                  <span>Operator {operation.requestedBy}</span>
                </div>
                {operation.error && (
                  <p className="mt-2 text-xs text-red-300">{operation.error}</p>
                )}
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
