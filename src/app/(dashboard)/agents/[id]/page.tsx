import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Brain,
  Clock,
  Cpu,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Send,
  Square,
  Terminal,
  Zap,
} from "lucide-react";

// Mock conversation stream
const conversationStream = [
  {
    timestamp: "19:18:22",
    type: "system",
    content: "You are reviewing PR #234 for tezadmin.web. Focus on security issues and code quality.",
  },
  {
    timestamp: "19:18:23",
    type: "assistant",
    content: "I'll start by examining the diff to understand the changes being made...",
  },
  {
    timestamp: "19:19:01",
    type: "tool_call",
    tool: "read_file",
    content: 'read_file("src/api/routes.ts")',
  },
  {
    timestamp: "19:19:03",
    type: "tool_result",
    content: "(2.3kb file contents returned)",
  },
  {
    timestamp: "19:19:15",
    type: "assistant",
    content: "I notice a potential issue with user input handling on line 142. The input flows directly to a query without sanitization, which could lead to injection vulnerabilities.",
  },
  {
    timestamp: "19:19:44",
    type: "decision",
    content: "Flagged potential SQL injection vulnerability. Confidence: 92%",
  },
  {
    timestamp: "19:20:01",
    type: "tool_call",
    tool: "exec",
    content: 'exec("npm test")',
  },
  {
    timestamp: "19:20:15",
    type: "tool_result",
    content: "47 passed, 0 failed",
  },
];

const typeStyles = {
  system: "bg-blue-500/10 border-blue-500/20 text-blue-200",
  assistant: "bg-card border-border/40",
  tool_call: "bg-violet-500/10 border-violet-500/20 text-violet-200",
  tool_result: "bg-muted/30 border-border/30 text-muted-foreground",
  decision: "bg-amber-500/10 border-amber-500/20 text-amber-200",
};

const typeIcons = {
  system: MessageSquare,
  assistant: Brain,
  tool_call: Terminal,
  tool_result: Cpu,
  decision: Zap,
};

// Mock agent data - in real app this would come from Convex
const mockAgent = {
  name: "Claude Code #47",
  type: "executor",
  model: "claude-sonnet-4",
  status: "active",
  host: "tank",
  currentTask: "PR review for tezadmin.web #234",
  startedAt: Date.now() - 12 * 60 * 1000,
  tokens: 12400,
};

type AgentDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AgentDetailPage({ params }: AgentDetailPageProps) {
  const { id } = await params;
  
  const elapsedMinutes = Math.floor((Date.now() - mockAgent.startedAt) / 60000);

  return (
    <div className="space-y-6">
      <PageHeader
        title={mockAgent.name}
        description={`${mockAgent.type} · ${mockAgent.model} · ${mockAgent.host}`}
        badge={mockAgent.status === "active" ? "Active" : mockAgent.status}
      />

      {/* Control bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="gap-2">
          <Pause className="h-4 w-4" />
          Pause
        </Button>
        <Button variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Redirect
        </Button>
        <Button variant="destructive" size="sm" className="gap-2">
          <Square className="h-4 w-4" />
          Kill
        </Button>
        <div className="flex-1" />
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{elapsedMinutes}m active</span>
          </div>
          <div className="flex items-center gap-1">
            <Zap className="h-4 w-4" />
            <span>{(mockAgent.tokens / 1000).toFixed(1)}k tokens</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Conversation stream */}
        <Card className="border-border/40 bg-card/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Conversation Stream</CardTitle>
              <Badge variant="outline" className="gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                </span>
                Live
              </Badge>
            </div>
            <CardDescription>
              Real-time agent dialogue, tool calls, and decisions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ScrollArea className="h-[400px] rounded-lg border border-border/30 bg-background/40 p-4">
              <div className="space-y-3">
                {conversationStream.map((entry, i) => {
                  const Icon = typeIcons[entry.type as keyof typeof typeIcons] || MessageSquare;
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 ${typeStyles[entry.type as keyof typeof typeStyles]}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium uppercase">
                          {entry.type.replace("_", " ")}
                        </span>
                        <span className="text-xs opacity-60 ml-auto">
                          {entry.timestamp}
                        </span>
                      </div>
                      <p className="text-sm">
                        {entry.tool && (
                          <code className="text-xs bg-black/20 px-1 py-0.5 rounded mr-2">
                            {entry.tool}
                          </code>
                        )}
                        {entry.content}
                      </p>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Message input */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Inject guidance or correction..."
                className="flex-1"
              />
              <Button size="sm" className="gap-2">
                <Send className="h-4 w-4" />
                Send
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Agent details sidebar */}
        <div className="space-y-4">
          <Card className="border-border/40 bg-card/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Current Task</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{mockAgent.currentTask}</p>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="secondary">In Progress</Badge>
                <Badge variant="outline">High Priority</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-card/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Agent Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="capitalize">{mockAgent.type}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Model</span>
                <span>{mockAgent.model}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Host</span>
                <Badge variant="outline">{mockAgent.host}</Badge>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Session</span>
                <code className="text-xs">tmux:code-47</code>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-card/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Session Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span>{elapsedMinutes} minutes</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tokens</span>
                <span>{mockAgent.tokens.toLocaleString()}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tool calls</span>
                <span>6</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Decisions</span>
                <span>2</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. cost</span>
                <span className="text-emerald-400">$0.18</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
