"use client";

import type { OperationEntry } from "@/lib/controls/optimistic-operations";
import { formatRelativeTime } from "@/lib/format";
import { OperationStatusBadge } from "@/components/agents/operation-status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, Clock } from "lucide-react";

type PendingOperationsProps = {
  operations: OperationEntry[];
  isLoading: boolean;
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
            return (
              <div
                key={operation.operationId}
                className="rounded-lg border border-border/60 bg-background/50 p-3"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-foreground">
                    {operation.command}
                  </span>
                  <OperationStatusBadge status={operation.status} />
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
