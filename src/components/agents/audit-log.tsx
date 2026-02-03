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
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type AuditLogProps = {
  audits: Array<Doc<"auditLogs">>;
  isLoading: boolean;
};

const outcomeStyles: Record<
  Doc<"auditLogs">["outcome"],
  { label: string; className: string }
> = {
  accepted: { label: "Accepted", className: "text-emerald-300 bg-emerald-400/10" },
  rejected: { label: "Rejected", className: "text-amber-300 bg-amber-400/10" },
  error: { label: "Error", className: "text-red-300 bg-red-400/10" },
  "timed-out": { label: "Timed out", className: "text-amber-300 bg-amber-400/10" },
  completed: { label: "Completed", className: "text-emerald-300 bg-emerald-400/10" },
};

export function AuditLog({ audits, isLoading }: AuditLogProps): React.ReactElement {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle>Audit Log</CardTitle>
        <CardDescription>Control actions recorded for this agent.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        {isLoading && (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
            Loading audit log...
          </div>
        )}

        {!isLoading && audits.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
            <AlertCircle className="mx-auto mb-2 h-5 w-5" />
            No audit entries recorded yet.
          </div>
        )}

        {!isLoading &&
          audits.map((audit) => {
            const outcome = outcomeStyles[audit.outcome];
            return (
              <div
                key={audit._id}
                className="rounded-lg border border-border/60 bg-background/50 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="uppercase tracking-wide text-muted-foreground">
                    {audit.action}
                  </span>
                  <span>{formatRelativeTime(audit.timestamp, "just now")}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground break-words">
                      {audit.command ?? audit.action}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requested by {audit.operatorEmail ?? audit.operatorId}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] uppercase", outcome.className)}
                  >
                    {outcome.label}
                  </Badge>
                </div>
                {audit.error && (
                  <p className="mt-2 text-xs text-red-300">{audit.error}</p>
                )}
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
