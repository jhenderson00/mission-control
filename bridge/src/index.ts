import { randomUUID } from "crypto";
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

class Bridge {
  private readonly gateway: GatewayClient;
  private readonly convex: ConvexClient;
  private readonly buffer: EventBuffer;
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
