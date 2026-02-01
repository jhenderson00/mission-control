import { ConvexClient, type PendingNotification } from "./convex-client";
import { GatewayClient, parsePresencePayload } from "./gateway-client";
import type { BridgeConfig, PresenceEntry, PresenceSnapshot } from "./types";

type NotificationDaemonConfig = {
  gatewayUrl: string;
  gatewayToken: string;
  convexUrl: string;
  convexSecret: string;
  reconnectIntervalMs: number;
  maxReconnectAttempts: number;
  requestTimeoutMs: number;
  pollIntervalMs: number;
  pollBatchSize: number;
  retryBackoffMs: number;
  agentIdAliases: Record<string, string>;
};

const DEFAULTS = {
  gatewayUrl: "ws://127.0.0.1:18789",
  reconnectIntervalMs: 5000,
  maxReconnectAttempts: 10,
  requestTimeoutMs: 10000,
  pollIntervalMs: 2000,
  pollBatchSize: 25,
  retryBackoffMs: 5000,
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

function parseAgentIdAliases(
  value: string | undefined
): Record<string, string> {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const entries: Record<string, string> = {};
      for (const [key, rawValue] of Object.entries(parsed)) {
        if (typeof rawValue !== "string") {
          continue;
        }
        const trimmedKey = key.trim();
        const trimmedValue = rawValue.trim();
        if (!trimmedKey || !trimmedValue) {
          continue;
        }
        entries[trimmedKey] = trimmedValue;
      }
      if (Object.keys(entries).length > 0) {
        return entries;
      }
    }
  } catch {
    // Fall through to delimiter-based parsing.
  }

  const aliases: Record<string, string> = {};
  for (const pair of value.split(",")) {
    const [fromRaw, toRaw] = pair.split("=");
    if (!fromRaw || !toRaw) {
      continue;
    }
    const from = fromRaw.trim();
    const to = toRaw.trim();
    if (!from || !to) {
      continue;
    }
    aliases[from] = to;
  }
  return aliases;
}

function agentIdFromSessionKey(sessionKey: string | undefined): string | null {
  if (!sessionKey) {
    return null;
  }
  const parts = sessionKey.split(":");
  if (parts.length < 2 || parts[0] !== "agent") {
    return null;
  }
  const candidate = parts[1];
  return candidate.length > 0 ? candidate : null;
}

function resolveSessionKey(
  entry: PresenceEntry,
  agentId: string | null
): string | null {
  if (entry.sessionKey) {
    return entry.sessionKey;
  }
  if (agentId) {
    return `agent:${agentId}:main`;
  }
  if (entry.deviceId.startsWith("agent:")) {
    return entry.deviceId;
  }
  return null;
}

function loadConfig(): NotificationDaemonConfig {
  const gatewayToken =
    process.env.OPENCLAW_GATEWAY_TOKEN ?? process.env.GATEWAY_TOKEN;
  if (!gatewayToken) {
    throw new Error("Missing required env var: OPENCLAW_GATEWAY_TOKEN");
  }
  const convexSecret =
    process.env.NOTIFICATION_DAEMON_SECRET ?? process.env.CONVEX_ACTION_SECRET;
  if (!convexSecret) {
    throw new Error("Missing required env var: CONVEX_ACTION_SECRET");
  }

  return {
    gatewayUrl:
      process.env.OPENCLAW_GATEWAY_URL ??
      process.env.GATEWAY_URL ??
      DEFAULTS.gatewayUrl,
    gatewayToken,
    convexUrl: requiredEnv("CONVEX_URL"),
    convexSecret,
    reconnectIntervalMs: parseNumber(
      process.env.RECONNECT_INTERVAL_MS,
      DEFAULTS.reconnectIntervalMs
    ),
    maxReconnectAttempts: parseNumber(
      process.env.MAX_RECONNECT_ATTEMPTS,
      DEFAULTS.maxReconnectAttempts
    ),
    requestTimeoutMs: parseNumber(
      process.env.REQUEST_TIMEOUT_MS,
      DEFAULTS.requestTimeoutMs
    ),
    pollIntervalMs: parseNumber(
      process.env.NOTIFICATION_POLL_INTERVAL_MS,
      DEFAULTS.pollIntervalMs
    ),
    pollBatchSize: parseNumber(
      process.env.NOTIFICATION_BATCH_SIZE,
      DEFAULTS.pollBatchSize
    ),
    retryBackoffMs: parseNumber(
      process.env.NOTIFICATION_RETRY_BACKOFF_MS,
      DEFAULTS.retryBackoffMs
    ),
    agentIdAliases: parseAgentIdAliases(
      process.env.NOTIFICATION_AGENT_ID_ALIASES ??
        process.env.BRIDGE_AGENT_ID_ALIASES
    ),
  };
}

class NotificationDaemon {
  private readonly gateway: GatewayClient;
  private readonly convex: ConvexClient;
  private readonly pollIntervalMs: number;
  private readonly pollBatchSize: number;
  private readonly retryBackoffMs: number;
  private readonly agentIdAliases: Record<string, string>;
  private pollTimer?: NodeJS.Timeout;
  private polling = false;
  private gatewayReady = false;
  private readonly sessionsByAgent = new Map<string, string>();

  constructor(private readonly config: NotificationDaemonConfig) {
    const gatewayConfig: BridgeConfig = {
      gatewayUrl: config.gatewayUrl,
      gatewayToken: config.gatewayToken,
      convexUrl: config.convexUrl,
      convexSecret: config.convexSecret,
      reconnectIntervalMs: config.reconnectIntervalMs,
      maxReconnectAttempts: config.maxReconnectAttempts,
      batchSize: 1,
      batchIntervalMs: 1000,
      requestTimeoutMs: config.requestTimeoutMs,
      agentIdAliases: config.agentIdAliases,
    };

    this.gateway = new GatewayClient(gatewayConfig);
    this.convex = new ConvexClient({
      baseUrl: config.convexUrl,
      secret: config.convexSecret,
    });
    this.pollIntervalMs = config.pollIntervalMs;
    this.pollBatchSize = config.pollBatchSize;
    this.retryBackoffMs = config.retryBackoffMs;
    this.agentIdAliases = config.agentIdAliases;
  }

  async start(): Promise<void> {
    this.gateway.on("connected", () => {
      this.gatewayReady = true;
      this.gateway
        .subscribePresence()
        .catch((error) =>
          console.error("[notify] failed to subscribe presence", error)
        );
      void this.seedPresence();
    });
    this.gateway.on("presence", (snapshot: PresenceSnapshot) => {
      this.handlePresenceSnapshot(snapshot);
    });
    this.gateway.on("disconnected", () => {
      this.gatewayReady = false;
      this.sessionsByAgent.clear();
      console.warn("[notify] gateway disconnected");
    });
    this.gateway.on("error", (error: Error) => {
      console.error("[notify] gateway error", error);
    });
    this.gateway.on("fatal", (error: Error) => {
      console.error("[notify] gateway fatal", error);
      process.exit(1);
    });

    this.startPolling();
    await this.gateway.start();
    console.log("[notify] daemon started");
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    this.gateway.close();
  }

  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
    void this.poll();
  }

  private normalizeAgentId(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const alias = this.agentIdAliases[trimmed];
    if (alias) {
      return alias;
    }
    const fromSessionKey = agentIdFromSessionKey(trimmed);
    if (fromSessionKey) {
      return fromSessionKey;
    }
    return trimmed;
  }

  private resolvePresenceAgentId(entry: PresenceEntry): string | null {
    const fromSessionKey = agentIdFromSessionKey(entry.sessionKey);
    const candidate = fromSessionKey ?? entry.agentId ?? entry.deviceId;
    return this.normalizeAgentId(candidate);
  }

  private handlePresenceSnapshot(snapshot: PresenceSnapshot): void {
    const nextSessions = new Map<string, string>();

    for (const entry of snapshot.entries) {
      const agentId = this.resolvePresenceAgentId(entry);
      if (!agentId) {
        continue;
      }
      const sessionKey = resolveSessionKey(entry, agentId);
      if (!sessionKey) {
        continue;
      }
      nextSessions.set(agentId, sessionKey);
    }

    this.sessionsByAgent.clear();
    for (const [agentId, sessionKey] of nextSessions.entries()) {
      this.sessionsByAgent.set(agentId, sessionKey);
    }
  }

  private async seedPresence(): Promise<void> {
    try {
      const payload = await this.gateway.call("system-presence");
      const snapshot = parsePresencePayload(payload);
      if (snapshot) {
        this.handlePresenceSnapshot(snapshot);
      }
    } catch (error) {
      console.warn("[notify] failed to seed presence", error);
    }
  }

  private shouldBackoff(notification: PendingNotification): boolean {
    if (!notification.lastAttemptAt) {
      return false;
    }
    const elapsed = Date.now() - notification.lastAttemptAt;
    return elapsed < this.retryBackoffMs;
  }

  private async poll(): Promise<void> {
    if (this.polling) {
      return;
    }
    this.polling = true;

    try {
      if (!this.gatewayReady) {
        return;
      }

      const pending = await this.convex.listPendingNotifications({
        limit: this.pollBatchSize,
        recipientType: "agent",
      });

      if (pending.length === 0) {
        return;
      }

      for (const notification of pending) {
        await this.deliverNotification(notification);
      }
    } catch (error) {
      console.error("[notify] polling error", error);
    } finally {
      this.polling = false;
    }
  }

  private async deliverNotification(
    notification: PendingNotification
  ): Promise<void> {
    const agentId = this.normalizeAgentId(notification.recipientId);
    if (!agentId) {
      return;
    }

    if (this.shouldBackoff(notification)) {
      return;
    }

    const sessionKey = this.sessionsByAgent.get(agentId);
    if (!sessionKey) {
      return;
    }

    try {
      await this.gateway.send(sessionKey, notification.message);
      await this.convex.markNotificationDelivered(notification._id, Date.now());
      console.log(`[notify] delivered ${notification._id} to ${agentId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gateway delivery failed";
      try {
        await this.convex.recordNotificationAttempt(
          notification._id,
          message
        );
      } catch (recordError) {
        console.error("[notify] failed to record delivery attempt", recordError);
      }
      console.warn(`[notify] delivery failed for ${notification._id}`, error);
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const daemon = new NotificationDaemon(config);

  process.on("SIGINT", () => {
    daemon.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    daemon.stop();
    process.exit(0);
  });

  await daemon.start();
}

void main();
