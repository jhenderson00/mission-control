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
