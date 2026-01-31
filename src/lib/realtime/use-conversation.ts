"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { useConnectionStatus } from "./connection-store";
import { useStateSync } from "./state-sync";

export type ConversationMessage = {
  sessionKey: string;
  agentId: string;
  role: "user" | "assistant" | "system";
  content: string;
  isStreaming: boolean;
  timestamp: number;
  sequence: number;
};

type UseConversationOptions = {
  limit?: number;
};

export function useConversation(
  sessionKey: string | undefined,
  options: UseConversationOptions = {}
) {
  useConnectionStatus();

  const data = useQuery(
    api.conversations.listBySession,
    sessionKey
      ? {
          sessionKey,
          limit: options.limit,
        }
      : "skip"
  );

  const sync = useStateSync<ConversationMessage>({
    key: sessionKey ? `conversation:${sessionKey}` : "conversation:inactive",
    items:
      sessionKey && data !== undefined
        ? (data as ConversationMessage[])
        : undefined,
    getId: (message) => `${message.sessionKey}-${message.sequence}`,
    getTimestamp: (message) => message.timestamp,
    getSequence: (message) => message.sequence,
  });

  const messages = useMemo<ConversationMessage[]>(
    () => sync.items,
    [sync.items]
  );

  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const isStreaming = useMemo(
    () => messages.some((message) => message.isStreaming),
    [messages]
  );

  return {
    messages,
    latestMessage,
    isStreaming,
    isLoading: sessionKey ? data === undefined : false,
    isSyncing: sync.isSyncing,
    hasGap: sync.hasGap,
    isStale: sync.isStale,
  };
}
