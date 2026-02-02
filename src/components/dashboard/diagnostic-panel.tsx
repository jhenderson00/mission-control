"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Activity, Gauge, ShieldAlert, Wrench } from "lucide-react";

type DiagnosticEvent = {
  _id: string;
  agentId: string;
  createdAt: number;
  eventType: string;
  summary: string;
  payload: unknown;
  sessionKey?: string;
  runId?: string;
  level?: string;
  toolName?: string;
  durationMs?: number;
  success?: boolean;
};

type DiagnosticPanelProps = {
  agentId?: string;
  limit?: number;
  className?: string;
};

const fallbackEvents: DiagnosticEvent[] = [
  {
    _id: "diag_1",
    agentId: "main",
    createdAt: Date.now() - 90 * 1000,
    eventType: "tool_call",
    summary: "Tool call: search - {\"q\":\"health check\"}",
    payload: { toolName: "search", toolInput: { q: "health check" } },
    toolName: "search",
  },
  {
    _id: "diag_2",
    agentId: "main",
    createdAt: Date.now() - 3 * 60 * 1000,
    eventType: "tool_result",
    summary: "Tool result: search - {\"status\":\"ok\"}",
    payload: { toolName: "search", durationMs: 210, status: "ok" },
    toolName: "search",
    durationMs: 210,
    success: true,
  },
  {
    _id: "diag_3",
    agentId: "main",
    createdAt: Date.now() - 7 * 60 * 1000,
    eventType: "token_usage",
    summary: "1,020 tokens (620 in / 400 out) - 1.2s",
    payload: { inputTokens: 620, outputTokens: 400, durationMs: 1200 },
    durationMs: 1200,
  },
  {
    _id: "diag_4",
    agentId: "main",
    createdAt: Date.now() - 11 * 60 * 1000,
    eventType: "diagnostic.warning",
    summary: "warning: Latency spike detected",
    payload: { level: "warning", message: "Latency spike detected" },
    level: "warning",
  },
  {
    _id: "diag_5",
    agentId: "system",
    createdAt: Date.now() - 13 * 60 * 1000,
    eventType: "health",
    summary: "Gateway health check: OK",
    payload: { ok: true },
    level: "ok",
  },
];

const levelTone: Record<string, string> = {
  error: "border-red-500/30 bg-red-500/10 text-red-200",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
};

const typeTone: Record<string, string> = {
  tool_call: "border-orange-500/30 bg-orange-500/10 text-orange-200",
  tool_result: "border-lime-500/30 bg-lime-500/10 text-lime-200",
  token_usage: "border-teal-500/30 bg-teal-500/10 text-teal-200",
  error: "border-red-500/30 bg-red-500/10 text-red-200",
  health: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
};

function formatEventType(eventType: string): string {
  return eventType
    .replace(/[_\.]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDurationMs(durationMs?: number): string {
  if (!durationMs || durationMs <= 0) {
    return "N/A";
  }
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatNumber(value?: number): string {
  if (!value && value !== 0) {
    return "N/A";
  }
  return value.toLocaleString();
}

function getPayloadRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return payload as Record<string, unknown>;
}

function extractTokenCounts(payload: unknown): {
  input?: number;
  output?: number;
  total?: number;
} {
  const record = getPayloadRecord(payload);
  if (!record) {
    return {};
  }
  const input =
    typeof record.inputTokens === "number"
      ? record.inputTokens
      : typeof record.input_tokens === "number"
        ? record.input_tokens
        : undefined;
  const output =
    typeof record.outputTokens === "number"
      ? record.outputTokens
      : typeof record.output_tokens === "number"
        ? record.output_tokens
        : undefined;
  const total =
    input !== undefined && output !== undefined
      ? input + output
      : input ?? output;
  return { input, output, total };
}

function extractErrorDetail(payload: unknown): { message?: string; stack?: string } {
  const record = getPayloadRecord(payload);
  if (!record) {
    return {};
  }
  const message =
    (typeof record.message === "string" && record.message) ||
    (typeof record.error === "string" && record.error) ||
    (typeof record.errorMessage === "string" && record.errorMessage) ||
    (typeof record.detail === "string" && record.detail) ||
    (typeof record.summary === "string" && record.summary) ||
    undefined;
  const stack =
    (typeof record.stack === "string" && record.stack) ||
    (typeof record.trace === "string" && record.trace) ||
    undefined;
  return { message, stack };
}

function stringifyPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload ?? "");
  }
}

function resolveToneForEvent(event: DiagnosticEvent): string {
  if (event.level && levelTone[event.level]) {
    return levelTone[event.level];
  }
  if (typeTone[event.eventType]) {
    return typeTone[event.eventType];
  }
  if (event.eventType.startsWith("diagnostic")) {
    return "border-violet-500/30 bg-violet-500/10 text-violet-200";
  }
  return "border-border/60 bg-muted/40 text-muted-foreground";
}

export function DiagnosticPanel({
  agentId,
  limit = 120,
  className,
}: DiagnosticPanelProps): React.ReactElement {
  const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  const data = useQuery(
    api.events.listDiagnostics,
    !hasConvex ? "skip" : { limit, agentId }
  );

  const events = hasConvex ? (data ?? []) : fallbackEvents;
  const isLoading = hasConvex && data === undefined;

  const timeline = useMemo(
    () => [...events].sort((a, b) => b.createdAt - a.createdAt),
    [events]
  );

  const toolEvents = useMemo(
    () =>
      timeline.filter(
        (event) =>
          event.eventType === "tool_call" || event.eventType === "tool_result"
      ),
    [timeline]
  );

  const errorEvents = useMemo(
    () =>
      timeline.filter(
        (event) =>
          event.eventType === "error" ||
          (event.eventType.startsWith("diagnostic") && event.level === "error")
      ),
    [timeline]
  );

  const performanceEvents = useMemo(
    () => timeline.filter((event) => event.eventType === "token_usage"),
    [timeline]
  );

  const latestHealth = useMemo(
    () => timeline.find((event) => event.eventType === "health"),
    [timeline]
  );

  const toolResults = useMemo(
    () => timeline.filter((event) => event.eventType === "tool_result"),
    [timeline]
  );

  const successCount = toolResults.filter((event) => event.success === true).length;
  const failureCount = toolResults.filter((event) => event.success === false).length;
  const successRate =
    toolResults.length > 0 ? Math.round((successCount / toolResults.length) * 100) : null;

  const tokenMetrics = useMemo(() => {
    let totalTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let durationTotal = 0;
    let durationCount = 0;

    for (const event of performanceEvents) {
      const tokens = extractTokenCounts(event.payload);
      if (typeof tokens.total === "number") {
        totalTokens += tokens.total;
      }
      if (typeof tokens.input === "number") {
        inputTokens += tokens.input;
      }
      if (typeof tokens.output === "number") {
        outputTokens += tokens.output;
      }
      if (typeof event.durationMs === "number" && event.durationMs > 0) {
        durationTotal += event.durationMs;
        durationCount += 1;
      }
    }

    return {
      totalTokens,
      inputTokens,
      outputTokens,
      avgDurationMs: durationCount > 0 ? durationTotal / durationCount : undefined,
    };
  }, [performanceEvents]);

  const healthStatus = (() => {
    if (!latestHealth) {
      return { label: "Unknown", tone: "border-border/60 text-muted-foreground" };
    }
    const record = getPayloadRecord(latestHealth.payload);
    const okValue = record?.ok;
    const ok = typeof okValue === "boolean" ? okValue : latestHealth.level === "ok";
    return ok
      ? { label: "Healthy", tone: "border-emerald-500/40 text-emerald-200" }
      : { label: "Degraded", tone: "border-amber-500/40 text-amber-200" };
  })();

  const metrics = [
    {
      label: "System Health",
      value: healthStatus.label,
      detail: latestHealth ? formatRelativeTime(latestHealth.createdAt, "N/A") : "N/A",
      icon: ShieldAlert,
      tone: healthStatus.tone,
    },
    {
      label: "Tool Success",
      value: successRate !== null ? `${successRate}%` : "N/A",
      detail:
        toolResults.length > 0
          ? `${successCount} success / ${failureCount} failed`
          : "No tool results",
      icon: Wrench,
      tone: "border-orange-500/40 text-orange-200",
    },
    {
      label: "Avg Response",
      value: tokenMetrics.avgDurationMs
        ? formatDurationMs(tokenMetrics.avgDurationMs)
        : "N/A",
      detail:
        performanceEvents.length > 0
          ? `${performanceEvents.length} samples`
          : "No timing data",
      icon: Gauge,
      tone: "border-sky-500/40 text-sky-200",
    },
    {
      label: "Token Usage",
      value:
        tokenMetrics.totalTokens > 0
          ? formatNumber(tokenMetrics.totalTokens)
          : "N/A",
      detail:
        performanceEvents.length > 0
          ? `${formatNumber(tokenMetrics.inputTokens)} in / ${formatNumber(tokenMetrics.outputTokens)} out`
          : "No usage yet",
      icon: Activity,
      tone: "border-teal-500/40 text-teal-200",
    },
  ];

  return (
    <Card className={cn("border-border/60 bg-card/40", className)}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Diagnostics</CardTitle>
          <CardDescription>
            Tooling, errors, and performance signals across live sessions.
          </CardDescription>
        </div>
        <Badge variant="outline">Live telemetry</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.label}
                className="rounded-xl border border-border/60 bg-background/50 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {metric.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {metric.value}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg border bg-background/70",
                      metric.tone
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{metric.detail}</p>
              </div>
            );
          })}
        </div>

        <Tabs defaultValue="timeline" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="tooling">Tooling</TabsTrigger>
            <TabsTrigger value="errors">Errors</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline">
            <ScrollArea className="h-[360px] pr-3">
              <div className="space-y-3">
                {isLoading && (
                  <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                    Loading diagnostics...
                  </div>
                )}
                {!isLoading && timeline.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                    No diagnostic events yet.
                  </div>
                )}
                {!isLoading &&
                  timeline.map((event) => (
                    <div
                      key={event._id}
                      className="rounded-xl border border-border/60 bg-background/50 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn("uppercase tracking-wide", resolveToneForEvent(event))}
                          >
                            {formatEventType(event.eventType)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-border/60 bg-card/40 text-xs text-muted-foreground"
                            title={event.agentId}
                          >
                            {event.agentId}
                          </Badge>
                          {event.toolName && (
                            <Badge variant="secondary">{event.toolName}</Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(event.createdAt, "just now")}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-foreground">{event.summary}</p>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              Inspect
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Event payload</DialogTitle>
                            </DialogHeader>
                            <pre className="max-h-[420px] overflow-auto rounded-lg bg-background/80 p-4 text-xs text-muted-foreground">
                              {stringifyPayload(event.payload)}
                            </pre>
                          </DialogContent>
                        </Dialog>
                      </div>
                      {event.durationMs && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Duration: {formatDurationMs(event.durationMs)}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="tooling">
            <ScrollArea className="h-[360px] pr-3">
              <div className="space-y-3">
                {toolEvents.length === 0 && !isLoading && (
                  <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                    No tool activity captured yet.
                  </div>
                )}
                {isLoading && (
                  <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                    Loading tool telemetry...
                  </div>
                )}
                {!isLoading &&
                  toolEvents.map((event) => {
                    const status =
                      event.eventType === "tool_result"
                        ? event.success === false
                          ? "Failed"
                          : event.success === true
                            ? "Succeeded"
                            : "Result"
                        : "Called";
                    const statusTone =
                      event.eventType === "tool_result"
                        ? event.success === false
                          ? "border-red-500/40 text-red-200"
                          : event.success === true
                            ? "border-emerald-500/40 text-emerald-200"
                            : "border-amber-500/40 text-amber-200"
                        : "border-amber-500/40 text-amber-200";

                    return (
                      <div
                        key={event._id}
                        className="rounded-xl border border-border/60 bg-background/50 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn("uppercase tracking-wide", resolveToneForEvent(event))}
                            >
                              {formatEventType(event.eventType)}
                            </Badge>
                            {event.toolName && (
                              <Badge variant="secondary">{event.toolName}</Badge>
                            )}
                            <Badge variant="outline" className={cn("text-xs", statusTone)}>
                              {status}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(event.createdAt, "just now")}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-foreground">{event.summary}</p>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>
                            Duration: {formatDurationMs(event.durationMs)}
                          </span>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                Inspect
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Tool payload</DialogTitle>
                              </DialogHeader>
                              <pre className="max-h-[420px] overflow-auto rounded-lg bg-background/80 p-4 text-xs text-muted-foreground">
                                {stringifyPayload(event.payload)}
                              </pre>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="errors">
            <ScrollArea className="h-[360px] pr-3">
              <div className="space-y-3">
                {errorEvents.length === 0 && !isLoading && (
                  <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                    No errors reported in the current window.
                  </div>
                )}
                {isLoading && (
                  <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                    Loading error logs...
                  </div>
                )}
                {!isLoading &&
                  errorEvents.map((event) => {
                    const detail = extractErrorDetail(event.payload);
                    return (
                      <div
                        key={event._id}
                        className="rounded-xl border border-border/60 bg-background/50 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn("uppercase tracking-wide", resolveToneForEvent(event))}
                            >
                              {formatEventType(event.eventType)}
                            </Badge>
                            {event.level && (
                              <Badge variant="outline" className={cn("text-xs", levelTone[event.level])}>
                                {event.level}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(event.createdAt, "just now")}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-foreground">
                          {detail.message ?? event.summary}
                        </p>
                        {detail.stack && (
                          <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-background/80 p-3 text-xs text-muted-foreground">
                            {detail.stack}
                          </pre>
                        )}
                        <div className="mt-3 flex justify-end">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                Inspect
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Error payload</DialogTitle>
                              </DialogHeader>
                              <pre className="max-h-[420px] overflow-auto rounded-lg bg-background/80 p-4 text-xs text-muted-foreground">
                                {stringifyPayload(event.payload)}
                              </pre>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="performance">
            <ScrollArea className="h-[360px] pr-3">
              <div className="space-y-3">
                {performanceEvents.length === 0 && !isLoading && (
                  <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                    No performance events captured yet.
                  </div>
                )}
                {isLoading && (
                  <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                    Loading performance metrics...
                  </div>
                )}
                {!isLoading &&
                  performanceEvents.map((event) => {
                    const tokens = extractTokenCounts(event.payload);
                    return (
                      <div
                        key={event._id}
                        className="rounded-xl border border-border/60 bg-background/50 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge
                            variant="outline"
                            className={cn("uppercase tracking-wide", resolveToneForEvent(event))}
                          >
                            {formatEventType(event.eventType)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(event.createdAt, "just now")}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-foreground">{event.summary}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            Tokens: {formatNumber(tokens.total)}
                            {tokens.input !== undefined && tokens.output !== undefined
                              ? ` (${formatNumber(tokens.input)} in / ${formatNumber(tokens.output)} out)`
                              : ""}
                          </span>
                          <span>Duration: {formatDurationMs(event.durationMs)}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
