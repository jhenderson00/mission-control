import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "@/components/conversation/message-bubble";
import type { ConversationMessage } from "@/lib/realtime";

const baseMessage: ConversationMessage = {
  sessionKey: "session_1",
  agentId: "agent_1",
  role: "assistant",
  content: "Hello",
  isStreaming: false,
  timestamp: Date.now(),
  sequence: 1,
};

describe("MessageBubble", () => {
  it("renders an operator message", () => {
    const message: ConversationMessage = {
      ...baseMessage,
      role: "user",
      content: "Operator update",
    };

    render(<MessageBubble message={message} />);
    expect(screen.getByText("Operator")).toBeInTheDocument();
    expect(screen.getByText("Operator update")).toBeInTheDocument();
    expect(screen.queryByText("Streaming")).not.toBeInTheDocument();
  });

  it("renders a system streaming message", () => {
    const message: ConversationMessage = {
      ...baseMessage,
      role: "system",
      content: "System notice",
      isStreaming: true,
    };

    render(<MessageBubble message={message} />);
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("System notice")).toBeInTheDocument();
    expect(screen.getByText("Streaming")).toBeInTheDocument();
  });

  it("renders an assistant message", () => {
    render(<MessageBubble message={baseMessage} />);
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
