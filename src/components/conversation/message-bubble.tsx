"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/format";
import { StreamingIndicator } from "@/components/conversation/streaming-indicator";
import type { ConversationMessage } from "@/lib/realtime";

type MessageBubbleProps = {
  message: ConversationMessage;
};

const roleLabels: Record<ConversationMessage["role"], string> = {
  user: "Operator",
  assistant: "Agent",
  system: "System",
};

export function MessageBubble({ message }: MessageBubbleProps): React.ReactElement {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const alignment = isSystem
    ? "justify-center"
    : isUser
      ? "justify-end"
      : "justify-start";

  const containerAlignment = isSystem
    ? "items-center text-center"
    : isUser
      ? "items-end text-right"
      : "items-start text-left";

  const bubbleStyles = isSystem
    ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
    : isUser
      ? "border-primary/40 bg-primary/15 text-foreground"
      : "border-border/60 bg-muted/40 text-foreground";

  return (
    <div className={cn("flex w-full", alignment)}>
      <div className={cn("flex max-w-[80%] flex-col gap-2", containerAlignment)}>
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 text-xs text-muted-foreground",
            isSystem && "justify-center"
          )}
        >
          <Badge
            variant="outline"
            className={cn(
              "border-border/60 bg-background/40 text-[10px] uppercase tracking-wide",
              isSystem && "border-amber-500/30 text-amber-200"
            )}
          >
            {roleLabels[message.role]}
          </Badge>
          <span>{formatRelativeTime(message.timestamp, "just now")}</span>
          {message.isStreaming ? (
            <StreamingIndicator label="Streaming" />
          ) : null}
        </div>
        <div
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-sm",
            bubbleStyles,
            message.isStreaming && !isSystem ? "shadow-primary/20" : ""
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    </div>
  );
}
