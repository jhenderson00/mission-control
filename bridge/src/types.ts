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
  error?: {
    message?: string;
    code?: string | number;
  };
};

export type HelloOkFrame = {
  type: "hello-ok";
  presence?: unknown;
  health?: unknown;
};

export type GatewayFrame = GatewayEvent | GatewayResponse | HelloOkFrame;

export type PresenceEntry = {
  deviceId: string;
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

export type BridgeEvent = {
  eventId: string;
  eventType: string;
  agentId: string;
  sessionKey?: string;
  timestamp: string;
  sequence: number;
  payload: unknown;
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
};
