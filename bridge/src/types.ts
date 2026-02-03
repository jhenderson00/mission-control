export type GatewayEvent = {
  type: "event";
  event: string;
  payload: unknown;
  seq?: number;
  stateVersion?: number;
};

export type GatewayRequest = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

export type GatewayResponse = {
  type: "res";
  id: string;
  ok: boolean;
  result?: unknown;
  payload?: unknown;
  error?: {
    message?: string;
    code?: string | number;
  };
};

export type HelloOkFrame = {
  type: "hello-ok";
  presence?: unknown;
  health?: unknown;
  features?: {
    methods?: string[];
    events?: string[];
    [key: string]: unknown;
  };
  snapshot?: {
    presence?: unknown;
    health?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type GatewayFrame = GatewayEvent | GatewayResponse | HelloOkFrame;

export type PresenceEntry = {
  deviceId: string;
  agentId?: string;
  sessionKey?: string;
  roles?: string[];
  scopes?: string[];
  connectedAt?: string;
  lastSeen?: string;
};

export type PresenceSnapshot = {
  entries: PresenceEntry[];
  observedAt: string;
};

export type AgentPresenceStatus = "online" | "offline" | "busy" | "paused";

export type AgentStatusUpdate = {
  agentId: string;
  status: AgentPresenceStatus;
  lastSeen: number;
  sessionInfo?: Record<string, unknown>;
};

export type AgentMetadataUpdate = {
  agentId: string;
  name?: string;
  type?: "coordinator" | "planner" | "executor" | "critic" | "specialist";
  model?: string;
  host?: string;
  status?: "idle" | "active" | "blocked" | "failed";
  sessionId?: string;
  description?: string;
  tags?: string[];
};

/**
 * Tool call event payload
 */
export type ToolCallPayload = {
  toolName: string;
  toolCallId?: string;
  toolInput?: unknown;
  status: "started" | "completed" | "failed";
  durationMs?: number;
  error?: string;
  stack?: string;
};

/**
 * Error event payload with optional stack trace
 */
export type ErrorEventPayload = {
  message: string;
  code?: string;
  stack?: string;
  context?: Record<string, unknown>;
  severity?: "error" | "warning" | "fatal";
  recoverable?: boolean;
};

/**
 * Agent thinking/reasoning event payload
 */
export type ThinkingEventPayload = {
  content?: string;
  thinking?: string;
  reasoning?: string;
  thinkingId?: string;
  phase?: string;
  confidence?: number;
  status?: string;
};

/**
 * Token usage metrics payload
 */
export type TokenUsagePayload = {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  durationMs?: number;
  model?: string;
  costUsd?: number;
};

/**
 * Session event payload for tracking session lifecycle
 */
export type SessionEventPayload = {
  sessionKey: string;
  event: "start" | "end" | "pause" | "resume";
  durationMs?: number;
  messageCount?: number;
  toolCallCount?: number;
  errorCount?: number;
  tokenUsage?: TokenUsagePayload;
};

/**
 * Memory operation event payload
 */
export type MemoryOperationPayload = {
  operation?: "read" | "write" | "update" | "delete" | "sync";
  memoryType?: "working" | "long_term" | "context" | "episodic";
  key?: string;
  sizeBytes?: number;
  durationMs?: number;
  success?: boolean;
  error?: string;
};

/**
 * Known event type discriminators
 */
export type BridgeEventType =
  | "agent"
  | "chat"
  | "presence"
  | "health"
  | "heartbeat"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "error"
  | "token_usage"
  | "session_start"
  | "session_end"
  | "memory_operation";

export type BridgeEvent = {
  eventId: string;
  eventType: string;
  agentId: string;
  sessionKey?: string;
  timestamp: string;
  sequence: number;
  payload: unknown;
  sourceEventId?: string;
  sourceEventType?: string;
  runId?: string;
};

export type BridgeConfig = {
  gatewayUrl: string;
  gatewayToken: string;
  convexUrl: string;
  convexSecret: string;
  reconnectIntervalMs: number;
  maxReconnectAttempts: number;
  batchSize: number;
  batchIntervalMs: number;
  requestTimeoutMs: number;
  agentIdAliases: Record<string, string>;
};

export type GatewayConnectionState = {
  connected: boolean;
  readyState: number | null;
  reconnecting: boolean;
  reconnectAttempts: number;
  lastConnectedAt?: string;
  lastDisconnectedAt?: string;
  lastError?: string;
};
