import { randomUUID } from "crypto";
import http from "http";
import { ConvexClient } from "./convex-client";
import { EventBuffer } from "./event-buffer";
import { GatewayClient } from "./gateway-client";
import type {
  BridgeConfig,
  BridgeEvent,
  GatewayEvent,
  HelloOkFrame,
} from "./types";

const DEFAULTS = {
  gatewayUrl: "ws://localhost:18789",
  reconnectIntervalMs: 5000,
  maxReconnectAttempts: 10,
  batchSize: 10,
  batchIntervalMs: 100,
  requestTimeoutMs: 10000,
  gapThresholdMs: 5000,
  historyLimit: 50,
  controlPort: 8787,
  controlMaxBodyBytes: 1024 * 1024,
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadConfig(): BridgeConfig {
  return {
    gatewayUrl: process.env.GATEWAY_URL ?? DEFAULTS.gatewayUrl,
    gatewayToken: requiredEnv("GATEWAY_TOKEN"),
    convexUrl: requiredEnv("CONVEX_URL"),
    convexSecret: requiredEnv("CONVEX_ACTION_SECRET"),
    reconnectIntervalMs: parseNumber(
      process.env.RECONNECT_INTERVAL_MS,
      DEFAULTS.reconnectIntervalMs
    ),
    maxReconnectAttempts: parseNumber(
      process.env.MAX_RECONNECT_ATTEMPTS,
      DEFAULTS.maxReconnectAttempts
    ),
    batchSize: parseNumber(
      process.env.EVENT_BATCH_SIZE,
      DEFAULTS.batchSize
    ),
    batchIntervalMs: parseNumber(
      process.env.EVENT_BATCH_INTERVAL_MS,
      DEFAULTS.batchIntervalMs
    ),
    requestTimeoutMs: parseNumber(
      process.env.REQUEST_TIMEOUT_MS,
      DEFAULTS.requestTimeoutMs
    ),
  };
}

function resolveString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function resolveAgentId(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    return (
      resolveString(record.agentId) ??
      resolveString(record.agent_id) ??
      resolveString(record.deviceId) ??
      resolveString(record.runId) ??
      resolveString(record.sessionKey) ??
      fallback
    );
  }
  return fallback;
}

function resolveSessionKey(payload: unknown): string | undefined {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    return (
      resolveString(record.sessionKey) ??
      resolveString(record.session_key) ??
      resolveString(record.sessionId) ??
      undefined
    );
  }
  return undefined;
}

function resolveEventId(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const candidate =
      resolveString(record.eventId) ?? resolveString(record.event_id);
    if (candidate) {
      return candidate;
    }
  }
  return randomUUID();
}

function resolveTimestamp(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const timestamp =
      resolveString(record.timestamp) ?? resolveString(record.createdAt);
    if (timestamp) {
      return timestamp;
    }
  }
  return new Date().toISOString();
}

function sessionKeyFromSession(session: unknown): string | null {
  if (session && typeof session === "object") {
    const record = session as Record<string, unknown>;
    return (
      resolveString(record.key) ??
      resolveString(record.sessionKey) ??
      resolveString(record.session_key) ??
      resolveString(record.id)
    );
  }
  return null;
}

function agentIdFromSession(session: unknown): string | null {
  if (session && typeof session === "object") {
    const record = session as Record<string, unknown>;
    return (
      resolveString(record.agentId) ??
      resolveString(record.agent_id) ??
      resolveString(record.ownerId)
    );
  }
  return null;
}

function resolveControlSecret(): string | null {
  return process.env.BRIDGE_CONTROL_SECRET ?? process.env.BRIDGE_SECRET ?? null;
}

function resolveHeaderValue(
  header: string | string[] | undefined
): string | null {
  if (Array.isArray(header)) {
    return header[0] ?? null;
  }
  return typeof header === "string" && header.length > 0 ? header : null;
}

function resolveControlHeader(headers: http.IncomingHttpHeaders): string | null {
  const direct =
    resolveHeaderValue(headers["bridge_control_secret"]) ??
    resolveHeaderValue(headers["bridge-control-secret"]);
  if (direct) {
    return direct;
  }
  const auth = resolveHeaderValue(headers.authorization);
  if (auth?.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ControlPayload = {
  method: string;
  params?: Record<string, unknown>;
  requestedBy: string;
};

type ControlAck = {
  requestId: string;
  status: "accepted" | "rejected" | "error";
  error?: string;
};

function parseControlPayload(payload: unknown): ControlPayload {
  if (!isRecord(payload)) {
    throw new Error("Invalid control payload");
  }
  const method = payload.method;
  const requestedBy = payload.requestedBy;
  const params = payload.params;
  if (typeof method !== "string" || method.length === 0) {
    throw new Error("Invalid control method");
  }
  if (typeof requestedBy !== "string" || requestedBy.length === 0) {
    throw new Error("Invalid requestedBy");
  }
  if (params !== undefined && !isRecord(params)) {
    throw new Error("Invalid params");
  }
  return { method, requestedBy, params };
}

function parseGatewayAck(
  response: unknown,
  fallbackRequestId: string
): ControlAck {
  if (isRecord(response)) {
    const requestId = response.requestId;
    const status = response.status;
    const error = response.error;
    if (
      typeof requestId === "string" &&
      (status === "accepted" || status === "rejected" || status === "error")
    ) {
      return {
        requestId,
        status,
        error: typeof error === "string" ? error : undefined,
      };
    }
  }

  return {
    requestId: fallbackRequestId,
    status: "error",
    error: "Invalid gateway response",
  };
}

async function readJsonBody(
  req: http.IncomingMessage
): Promise<{ body: unknown; tooLarge: boolean }> {
  const maxBytes = DEFAULTS.controlMaxBodyBytes;
  return new Promise((resolve, reject) => {
    let total = 0;
    let raw = "";
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.removeAllListeners("data");
        req.removeAllListeners("end");
        resolve({ body: null, tooLarge: true });
        return;
      }
      raw += chunk.toString();
    });
    req.on("end", () => {
      if (raw.length === 0) {
        resolve({ body: null, tooLarge: false });
        return;
      }
      try {
        resolve({ body: JSON.parse(raw), tooLarge: false });
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

class Bridge {
  private readonly gateway: GatewayClient;
  private readonly convex: ConvexClient;
  private readonly buffer: EventBuffer;
  private controlServer?: http.Server;
  private flushTimer?: NodeJS.Timeout;
  private flushing = false;
  private localSequence = 0;
  private lastEventTime = 0;

  constructor(private readonly config: BridgeConfig) {
    this.gateway = new GatewayClient(config);
    this.convex = new ConvexClient({
      baseUrl: config.convexUrl,
      secret: config.convexSecret,
    });
    this.buffer = new EventBuffer(config.batchSize);
  }

  async start(): Promise<void> {
    this.gateway.on("connected", (hello: HelloOkFrame | null) => {
      void this.onConnected(hello);
    });
    this.gateway.on("event", (event: GatewayEvent) => {
      this.handleGatewayEvent(event);
    });
    this.gateway.on("disconnected", () => {
      console.warn("[bridge] gateway disconnected");
    });
    this.gateway.on("error", (error: Error) => {
      console.error("[bridge] gateway error", error);
    });
    this.gateway.on("fatal", (error: Error) => {
      console.error("[bridge] gateway fatal", error);
      process.exit(1);
    });

    await this.gateway.connect();
    this.startFlushLoop();
    this.startControlServer();
  }

  private startFlushLoop(): void {
    this.flushTimer = setInterval(() => {
      void this.flushEvents();
    }, this.config.batchIntervalMs);
  }

  private async onConnected(hello: HelloOkFrame | null): Promise<void> {
    try {
      await this.gateway.subscribe([
        "agent",
        "chat",
        "presence",
        "heartbeat",
        "health",
      ]);
    } catch (error) {
      console.error("[bridge] failed to subscribe to gateway", error);
    }

    await this.initialSync(hello);
  }

  private startControlServer(): void {
    const secret = resolveControlSecret();
    if (!secret) {
      console.warn(
        "[bridge] BRIDGE_CONTROL_SECRET not set; control endpoint disabled"
      );
      return;
    }

    const port = parseNumber(
      process.env.BRIDGE_CONTROL_PORT ?? process.env.PORT,
      DEFAULTS.controlPort
    );

    this.controlServer = http.createServer((req, res) => {
      void this.handleControlRequest(req, res, secret);
    });

    this.controlServer.on("error", (error) => {
      console.error("[bridge] control server error", error);
    });

    this.controlServer.listen(port, () => {
      console.log(`[bridge] control endpoint listening on :${port}`);
    });
  }

  private async handleControlRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    secret: string
  ): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method !== "POST" || url.pathname !== "/api/control") {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    const providedSecret = resolveControlHeader(req.headers);
    if (!providedSecret || providedSecret !== secret) {
      res.statusCode = 401;
      res.end("Unauthorized");
      return;
    }

    let payload: ControlPayload;
    try {
      const { body, tooLarge } = await readJsonBody(req);
      if (tooLarge) {
        res.statusCode = 413;
        res.end("Payload too large");
        return;
      }
      payload = parseControlPayload(body);
    } catch (error) {
      res.statusCode = 400;
      res.end("Invalid JSON payload");
      return;
    }

    const requestId =
      typeof payload.params?.requestId === "string" &&
      payload.params.requestId.length > 0
        ? payload.params.requestId
        : randomUUID();

    const gatewayParams = {
      ...(payload.params ?? {}),
      requestId,
      requestedBy: payload.requestedBy,
    };

    let ack: ControlAck;
    try {
      const response = await this.gateway.request(payload.method, gatewayParams);
      ack = parseGatewayAck(response, requestId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gateway error";
      ack = { requestId, status: "error", error: message };
    }

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(ack));
  }

  private handleGatewayEvent(frame: GatewayEvent): void {
    const now = Date.now();
    if (this.lastEventTime && now - this.lastEventTime > DEFAULTS.gapThresholdMs) {
      console.warn("[bridge] detected gap, triggering state sync");
      void this.initialSync(null);
    }
    this.lastEventTime = now;

    const event = this.normalizeGatewayEvent(frame);
    const shouldFlush = this.buffer.add(event);
    if (shouldFlush) {
      void this.flushEvents();
    }
  }

  private normalizeGatewayEvent(frame: GatewayEvent): BridgeEvent {
    const payload = frame.payload;
    const sessionKey = resolveSessionKey(payload);
    const agentId =
      frame.event === "presence"
        ? "system"
        : resolveAgentId(payload, "unknown");

    return {
      eventId: resolveEventId(payload),
      eventType: frame.event,
      agentId,
      sessionKey,
      timestamp: resolveTimestamp(payload),
      sequence: frame.seq ?? this.nextSequence(),
      payload,
    };
  }

  private async flushEvents(): Promise<void> {
    if (this.flushing) {
      return;
    }
    const batch = this.buffer.drain();
    if (batch.length === 0) {
      return;
    }

    this.flushing = true;
    try {
      await this.convex.ingestEvents(batch);
    } catch (error) {
      console.error("[bridge] failed to ingest events", error);
      this.buffer.requeue(batch);
    } finally {
      this.flushing = false;
    }
  }

  private async initialSync(hello: HelloOkFrame | null): Promise<void> {
    const syncEvents: BridgeEvent[] = [];

    if (hello?.presence) {
      syncEvents.push(this.buildSyncEvent("presence", "system", hello.presence));
    }
    if (hello?.health) {
      syncEvents.push(this.buildSyncEvent("health", "system", hello.health));
    }

    const presence = await this.safeRequest("system-presence");
    if (presence) {
      syncEvents.push(this.buildSyncEvent("presence", "system", presence));
    }

    const sessions = await this.safeRequest("sessions.list");
    if (Array.isArray(sessions)) {
      for (const session of sessions) {
        const sessionKey = sessionKeyFromSession(session);
        if (!sessionKey) {
          continue;
        }
        const history = await this.safeRequest("chat.history", {
          sessionKey,
          limit: DEFAULTS.historyLimit,
        });
        if (history) {
          const agentId = agentIdFromSession(session) ?? "system";
          syncEvents.push(
            this.buildSyncEvent("chat", agentId, { messages: history }, sessionKey)
          );
        }
      }
    }

    if (syncEvents.length > 0) {
      try {
        await this.convex.ingestEvents(syncEvents);
      } catch (error) {
        console.error("[bridge] failed to ingest sync events", error);
      }
    }
  }

  private async safeRequest(method: string, params?: unknown): Promise<unknown | null> {
    try {
      return await this.gateway.request(method, params);
    } catch (error) {
      console.warn(`[bridge] gateway request failed (${method})`, error);
      return null;
    }
  }

  private buildSyncEvent(
    eventType: string,
    agentId: string,
    payload: unknown,
    sessionKey?: string
  ): BridgeEvent {
    return {
      eventId: randomUUID(),
      eventType,
      agentId,
      sessionKey,
      timestamp: new Date().toISOString(),
      sequence: this.nextSequence(),
      payload,
    };
  }

  private nextSequence(): number {
    this.localSequence += 1;
    return this.localSequence;
  }
}

async function main(): Promise<void> {
  const bridge = new Bridge(loadConfig());
  await bridge.start();
}

main().catch((error) => {
  console.error("[bridge] startup failure", error);
  process.exit(1);
});
