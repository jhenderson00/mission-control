"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { useConnectionStatus } from "./connection-store";

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

  const messages = useMemo<ConversationMessage[]>(
    () => (data ?? []) as ConversationMessage[],
    [data]
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
  };
}
