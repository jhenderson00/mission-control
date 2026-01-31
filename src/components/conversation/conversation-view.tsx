"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StreamingIndicator } from "@/components/conversation/streaming-indicator";
import { MessageBubble } from "@/components/conversation/message-bubble";
import type { ConversationMessage } from "@/lib/realtime";

type ConversationViewProps = {
  messages: ConversationMessage[];
  isLoading?: boolean;
  isStreaming?: boolean;
  sessionKey?: string;
  className?: string;
};

export function ConversationView({
  messages,
  isLoading = false,
  isStreaming = false,
  sessionKey,
  className,
}: ConversationViewProps): React.ReactElement {
  const orderedMessages = useMemo(() => {
    return [...messages].sort((a, b) => a.sequence - b.sequence);
  }, [messages]);

  const latestMessage = orderedMessages[orderedMessages.length - 1];
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollAnchorRef.current) return;
    scrollAnchorRef.current.scrollIntoView({
      behavior: latestMessage?.isStreaming ? "auto" : "smooth",
      block: "end",
    });
  }, [orderedMessages.length, latestMessage?.content, latestMessage?.isStreaming]);

  const sessionLabel = sessionKey ? `Session ${sessionKey.slice(0, 8)}` : "No session";

  return (
    <Card className={cn("border-border/60 bg-card/40", className)}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Live Conversation</CardTitle>
          <p className="text-sm text-muted-foreground">
            Streamed dialog between the agent and its operator.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {sessionLabel}
          </Badge>
          {isStreaming ? (
            <StreamingIndicator label="Streaming" />
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              Idle
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[420px] sm:h-[480px]">
          <div
            className="flex flex-col gap-4 pr-4"
            aria-live="polite"
            aria-busy={isLoading}
          >
            {isLoading && (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                Loading conversation stream...
              </div>
            )}

            {!isLoading && !sessionKey && (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                No active session detected for this agent yet.
              </div>
            )}

            {!isLoading && sessionKey && orderedMessages.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                Waiting for the first message to arrive...
              </div>
            )}

            {!isLoading && orderedMessages.length > 0 && (
              <div className="flex flex-col gap-4">
                {orderedMessages.map((message) => (
                  <MessageBubble
                    key={`${message.sessionKey}-${message.sequence}`}
                    message={message}
                  />
                ))}
              </div>
            )}
            <div ref={scrollAnchorRef} />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
