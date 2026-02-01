import { randomUUID } from "crypto";
import http from "http";
import { ConvexClient } from "./convex-client";
import {
  buildGatewayActions,
  ControlCommand,
  ControlValidationError,
  executeGatewayActions,
  parseControlPayload,
  ParsedControlPayload,
  resolveSessionKeyForAgent,
} from "./control-commands";
import { EventBuffer } from "./event-buffer";
import { GatewayClient, parsePresencePayload } from "./gateway-client";
import type {
  BridgeConfig,
  BridgeEvent,
  GatewayEvent,
  HelloOkFrame,
  AgentStatusUpdate,
  PresenceEntry,
  PresenceSnapshot,
} from "./types";

const DEFAULTS = {
  gatewayUrl: "ws://127.0.0.1:18789",
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

const BUSY_ACTIVITY_WINDOW_MS = 2 * 60 * 1000;

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

function loadConfig(): BridgeConfig {
  const gatewayToken =
    process.env.OPENCLAW_GATEWAY_TOKEN ?? process.env.GATEWAY_TOKEN;
  if (!gatewayToken) {
    throw new Error("Missing required env var: OPENCLAW_GATEWAY_TOKEN");
  }

  return {
    gatewayUrl:
      process.env.OPENCLAW_GATEWAY_URL ??
      process.env.GATEWAY_URL ??
      DEFAULTS.gatewayUrl,
    gatewayToken,
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
    agentIdAliases: parseAgentIdAliases(
      process.env.BRIDGE_AGENT_ID_ALIASES
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

function parseTimestampMs(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
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

type ControlAck = {
  requestId: string;
  status: "accepted" | "rejected" | "error";
  error?: string;
};

type ActivitySnapshot = {
  lastActivity: number;
  sessionKey?: string;
};

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
  private readonly agentIdAliases: Record<string, string>;
  private readonly logStatusSync: boolean;
  private controlServer?: http.Server;
  private flushTimer?: NodeJS.Timeout;
  private flushing = false;
  private localSequence = 0;
  private lastEventTime = 0;
  private readonly presenceAgents = new Set<string>();
  private readonly recentActivity = new Map<string, ActivitySnapshot>();
  private readonly pausedAgents = new Set<string>();

  constructor(private readonly config: BridgeConfig) {
    this.gateway = new GatewayClient(config);
    this.convex = new ConvexClient({
      baseUrl: config.convexUrl,
      secret: config.convexSecret,
    });
    this.buffer = new EventBuffer(config.batchSize);
    this.agentIdAliases = config.agentIdAliases;
    this.logStatusSync = process.env.BRIDGE_LOG_STATUS === "1";
    if (Object.keys(this.agentIdAliases).length > 0) {
      const mappings = Object.entries(this.agentIdAliases)
        .map(([from, to]) => `${from} -> ${to}`)
        .join(", ");
      console.log(`[bridge] agentId aliases enabled: ${mappings}`);
    }
  }

  async start(): Promise<void> {
    this.gateway.on("connected", (hello: HelloOkFrame | null) => {
      void this.onConnected(hello);
    });
    this.gateway.on("event", (event: GatewayEvent) => {
      this.handleGatewayEvent(event);
    });
    this.gateway.on("presence", (snapshot: PresenceSnapshot) => {
      void this.handlePresenceSnapshot(snapshot);
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

    this.startFlushLoop();
    this.startControlServer();
    await this.gateway.start();
  }

  private startFlushLoop(): void {
    this.flushTimer = setInterval(() => {
      void this.flushEvents();
    }, this.config.batchIntervalMs);
  }

  private async onConnected(hello: HelloOkFrame | null): Promise<void> {
    console.log("[bridge] gateway connected");
    const methods = Array.isArray(hello?.features?.methods)
      ? hello?.features?.methods
      : null;
    const supportsSubscribe = methods ? methods.includes("subscribe") : true;

    if (supportsSubscribe) {
      try {
        await this.gateway.subscribe([
          "agent",
          "chat",
          "heartbeat",
          "health",
        ]);
        await this.gateway.subscribePresence();
      } catch (error) {
        console.error("[bridge] failed to subscribe to gateway", error);
      }
    } else {
      console.warn(
        "[bridge] gateway does not advertise subscribe; skipping explicit subscriptions"
      );
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

  private resolvePresenceAgentId(entry: PresenceEntry): string {
    const fromSessionKey = agentIdFromSessionKey(entry.sessionKey);
    const candidate = fromSessionKey ?? entry.agentId ?? entry.deviceId;
    return this.normalizeAgentId(candidate) ?? entry.deviceId;
  }

  private normalizePresencePayload(payload: unknown): unknown {
    if (!payload || typeof payload !== "object") {
      return payload;
    }
    const record = payload as Record<string, unknown>;
    const entriesRaw = record.entries;
    if (!Array.isArray(entriesRaw)) {
      return payload;
    }

    let mutated = false;
    const normalizedEntries = entriesRaw.map((entry) => {
      if (!entry || typeof entry !== "object") {
        return entry;
      }
      const entryRecord = entry as Record<string, unknown>;
      const deviceId = resolveString(entryRecord.deviceId);
      if (!deviceId) {
        return entry;
      }
      const sessionKey =
        resolveString(entryRecord.sessionKey) ??
        resolveString(entryRecord.session_key);
      const entryAgentId =
        resolveString(entryRecord.agentId) ??
        resolveString(entryRecord.agent_id);
      const candidate =
        agentIdFromSessionKey(sessionKey ?? undefined) ?? entryAgentId ?? deviceId;
      const normalized = this.normalizeAgentId(candidate);
      if (!normalized || normalized === deviceId) {
        return entry;
      }
      mutated = true;
      return {
        ...entryRecord,
        deviceId: normalized,
        gatewayDeviceId: deviceId,
      };
    });

    if (!mutated) {
      return payload;
    }

    return {
      ...record,
      entries: normalizedEntries,
    };
  }

  private buildHealthUpdates(payload: unknown): AgentStatusUpdate[] {
    if (!payload || typeof payload !== "object") {
      return [];
    }
    const record = payload as Record<string, unknown>;
    const agentsRaw = Array.isArray(record.agents) ? record.agents : null;
    const eventTimestamp =
      typeof record.ts === "number" && Number.isFinite(record.ts)
        ? record.ts
        : Date.now();
    const updates: AgentStatusUpdate[] = [];

    const pushUpdate = (agentIdRaw: string | null, sessionsRaw?: unknown) => {
      if (!agentIdRaw) {
        return;
      }
      const normalizedAgentId = this.normalizeAgentId(agentIdRaw) ?? agentIdRaw;
      if (!normalizedAgentId) {
        return;
      }

      let lastSeen = eventTimestamp;
      let sessionKey: string | undefined;
      if (sessionsRaw && typeof sessionsRaw === "object") {
        const sessionsRecord = sessionsRaw as Record<string, unknown>;
        const recentRaw = sessionsRecord.recent;
        if (Array.isArray(recentRaw)) {
          for (const session of recentRaw) {
            if (!session || typeof session !== "object") {
              continue;
            }
            const sessionRecord = session as Record<string, unknown>;
            const updatedAt = sessionRecord.updatedAt;
            if (typeof updatedAt === "number" && updatedAt > lastSeen) {
              lastSeen = updatedAt;
              sessionKey = resolveString(sessionRecord.key) ?? sessionKey;
            }
          }
        }
      }

      const activity: ActivitySnapshot = { lastActivity: lastSeen, sessionKey };
      const existing = this.recentActivity.get(normalizedAgentId);
      if (!existing || lastSeen > existing.lastActivity) {
        this.recentActivity.set(normalizedAgentId, activity);
      }
      const status = this.resolvePresenceStatus(
        normalizedAgentId,
        lastSeen,
        this.recentActivity.get(normalizedAgentId)
      );
      updates.push({
        agentId: normalizedAgentId,
        status,
        lastSeen,
        sessionInfo: {
          source: "health",
          sessionKey,
          lastSeen,
        },
      });
    };

    if (agentsRaw && agentsRaw.length > 0) {
      for (const agent of agentsRaw) {
        if (!agent || typeof agent !== "object") {
          continue;
        }
        const agentRecord = agent as Record<string, unknown>;
        const agentId =
          resolveString(agentRecord.agentId) ?? resolveString(agentRecord.id);
        pushUpdate(agentId, agentRecord.sessions);
      }
      return updates;
    }

    const fallbackAgentId = resolveString(record.defaultAgentId);
    if (fallbackAgentId) {
      pushUpdate(fallbackAgentId, record.sessions);
    }

    return updates;
  }

  private async handleHealthSnapshot(payload: unknown): Promise<void> {
    const updates = this.buildHealthUpdates(payload);
    if (updates.length === 0) {
      return;
    }

    try {
      await this.convex.updateAgentStatuses(updates);
      if (this.logStatusSync) {
        const preview = updates
          .slice(0, 5)
          .map((update) => `${update.agentId}:${update.status}`)
          .join(", ");
        const suffix = updates.length > 5 ? "..." : "";
        console.log(
          `[bridge] health sync (${updates.length}): ${preview}${suffix}`
        );
      }
    } catch (error) {
      console.error("[bridge] failed to update health statuses", error);
    }
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

    let payload: ParsedControlPayload;
    try {
      const { body, tooLarge } = await readJsonBody(req);
      if (tooLarge) {
        res.statusCode = 413;
        res.end("Payload too large");
        return;
      }
      payload = parseControlPayload(body);
    } catch (error) {
      if (error instanceof ControlValidationError) {
        res.statusCode = 400;
        res.end(error.message);
        return;
      }
      res.statusCode = 400;
      res.end("Invalid JSON payload");
      return;
    }

    const requestId = payload.requestId ?? randomUUID();
    let ack: ControlAck;
    try {
      if (payload.agentIds) {
        ack = await this.executeBulkControl(
          payload.agentIds,
          payload.command,
          payload.params,
          requestId
        );
      } else if (payload.agentId) {
        ack = await this.executeControl(
          payload.agentId,
          payload.command,
          payload.params,
          requestId
        );
      } else {
        throw new ControlValidationError("Missing agentId");
      }
    } catch (error) {
      if (error instanceof ControlValidationError) {
        ack = { requestId, status: "rejected", error: error.message };
      } else {
        const message = error instanceof Error ? error.message : "Gateway error";
        ack = { requestId, status: "error", error: message };
      }
    }

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(ack));
  }

  private async executeBulkControl(
    agentIds: string[],
    command: ControlCommand,
    params: Record<string, unknown>,
    requestId: string
  ): Promise<ControlAck> {
    try {
      await Promise.all(
        agentIds.map((agentId) =>
          this.executeControl(agentId, command, params, requestId)
        )
      );
      return { requestId, status: "accepted" };
    } catch (error) {
      if (error instanceof ControlValidationError) {
        return { requestId, status: "rejected", error: error.message };
      }
      const message = error instanceof Error ? error.message : "Gateway error";
      return { requestId, status: "error", error: message };
    }
  }

  private async executeControl(
    agentId: string,
    command: ControlCommand,
    params: Record<string, unknown>,
    requestId: string
  ): Promise<ControlAck> {
    const sessionKey = resolveSessionKeyForAgent(agentId, params);
    const actions = buildGatewayActions(command, params, sessionKey);
    await executeGatewayActions(this.gateway, actions);

    switch (command) {
      case "pause":
        this.pausedAgents.add(agentId);
        void this.updateManualStatus(agentId, "paused", sessionKey);
        break;
      case "resume":
      case "redirect":
      case "restart":
        this.pausedAgents.delete(agentId);
        void this.updateManualStatus(agentId, "busy", sessionKey);
        break;
      case "kill":
      case "priority":
        break;
    }

    return { requestId, status: "accepted" };
  }

  private handleGatewayEvent(frame: GatewayEvent): void {
    const now = Date.now();
    if (this.lastEventTime && now - this.lastEventTime > DEFAULTS.gapThresholdMs) {
      console.warn("[bridge] detected gap, triggering state sync");
      void this.initialSync(null);
    }
    this.lastEventTime = now;

    this.trackSessionActivity(frame);
    if (frame.event === "health") {
      void this.handleHealthSnapshot(frame.payload);
    }
    const event = this.normalizeGatewayEvent(frame);
    const shouldFlush = this.buffer.add(event);
    if (shouldFlush) {
      void this.flushEvents();
    }
  }

  private normalizeGatewayEvent(frame: GatewayEvent): BridgeEvent {
    const payload = frame.payload;
    const sessionKey = resolveSessionKey(payload);
    const rawAgentId =
      frame.event === "presence"
        ? "system"
        : resolveAgentId(payload, "unknown");
    const agentId = this.normalizeAgentId(rawAgentId) ?? rawAgentId;
    const normalizedPayload =
      frame.event === "presence"
        ? this.normalizePresencePayload(payload)
        : payload;

    return {
      eventId: resolveEventId(payload),
      eventType: frame.event,
      agentId,
      sessionKey,
      timestamp: resolveTimestamp(payload),
      sequence: frame.seq ?? this.nextSequence(),
      payload: normalizedPayload,
    };
  }

  private trackSessionActivity(frame: GatewayEvent): void {
    if (frame.event !== "agent" && frame.event !== "chat") {
      return;
    }

    const payload = frame.payload;
    const sessionKey = resolveSessionKey(payload);
    const rawAgentId =
      agentIdFromSessionKey(sessionKey) ?? resolveAgentId(payload, "");
    const agentId = this.normalizeAgentId(rawAgentId);

    if (!agentId) {
      return;
    }

    const timestamp = parseTimestampMs(resolveTimestamp(payload), Date.now());
    this.recentActivity.set(agentId, { lastActivity: timestamp, sessionKey });

    if (this.pausedAgents.has(agentId)) {
      this.pausedAgents.delete(agentId);
    }
  }

  private resolvePresenceStatus(
    agentId: string,
    lastSeen: number,
    activity?: ActivitySnapshot
  ): AgentStatusUpdate["status"] {
    if (this.pausedAgents.has(agentId)) {
      return "paused";
    }
    const now = Math.max(Date.now(), lastSeen);
    if (activity && now - activity.lastActivity <= BUSY_ACTIVITY_WINDOW_MS) {
      return "busy";
    }
    return "online";
  }

  private buildSessionInfo(
    entry: PresenceEntry,
    activity: ActivitySnapshot | undefined,
    lastSeen: number
  ): Record<string, unknown> {
    const info: Record<string, unknown> = {
      deviceId: entry.deviceId,
      roles: entry.roles,
      scopes: entry.scopes,
      connectedAt: entry.connectedAt,
      lastSeen,
    };

    if (activity?.sessionKey) {
      info.sessionKey = activity.sessionKey;
    }
    if (activity?.lastActivity) {
      info.lastActivity = activity.lastActivity;
    }

    return info;
  }

  private async handlePresenceSnapshot(
    snapshot: PresenceSnapshot
  ): Promise<void> {
    const observedAt = parseTimestampMs(snapshot.observedAt, Date.now());
    const nextPresence = new Set<string>();
    const updates: AgentStatusUpdate[] = [];

    for (const entry of snapshot.entries) {
      const agentId = this.resolvePresenceAgentId(entry);
      nextPresence.add(agentId);

      const lastSeen = parseTimestampMs(
        entry.lastSeen ?? entry.connectedAt,
        observedAt
      );
      const activity = this.recentActivity.get(agentId);
      const status = this.resolvePresenceStatus(agentId, lastSeen, activity);

      updates.push({
        agentId,
        status,
        lastSeen,
        sessionInfo: this.buildSessionInfo(entry, activity, lastSeen),
      });
    }

    for (const agentId of this.presenceAgents) {
      if (nextPresence.has(agentId)) {
        continue;
      }
      const activity = this.recentActivity.get(agentId);
      const sessionInfo = activity
        ? {
            sessionKey: activity.sessionKey,
            lastActivity: activity.lastActivity,
          }
        : undefined;
      updates.push({
        agentId,
        status: "offline",
        lastSeen: observedAt,
        sessionInfo,
      });
    }

    this.presenceAgents.clear();
    nextPresence.forEach((agentId) => this.presenceAgents.add(agentId));

    if (updates.length === 0) {
      return;
    }

    try {
      await this.convex.updateAgentStatuses(updates);
      if (this.logStatusSync) {
        const preview = updates
          .slice(0, 5)
          .map((update) => `${update.agentId}:${update.status}`)
          .join(", ");
        const suffix = updates.length > 5 ? "..." : "";
        console.log(
          `[bridge] status sync (${updates.length}): ${preview}${suffix}`
        );
      }
    } catch (error) {
      console.error("[bridge] failed to update agent statuses", error);
    }
  }

  private async updateManualStatus(
    agentId: string,
    status: AgentStatusUpdate["status"],
    sessionKey?: string
  ): Promise<void> {
    try {
      await this.convex.updateAgentStatuses([
        {
          agentId,
          status,
          lastSeen: Date.now(),
          sessionInfo: sessionKey ? { sessionKey } : undefined,
        },
      ]);
    } catch (error) {
      console.error("[bridge] failed to update agent status override", error);
    }
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

    const helloPresence = hello?.presence ?? hello?.snapshot?.presence;
    const helloHealth = hello?.health ?? hello?.snapshot?.health;

    if (helloPresence) {
      const normalizedPresence = this.normalizePresencePayload(helloPresence);
      syncEvents.push(
        this.buildSyncEvent("presence", "system", normalizedPresence)
      );
      const snapshot = parsePresencePayload(normalizedPresence);
      if (snapshot) {
        await this.handlePresenceSnapshot(snapshot);
      }
    }
    if (helloHealth) {
      syncEvents.push(this.buildSyncEvent("health", "system", helloHealth));
      await this.handleHealthSnapshot(helloHealth);
    }

    const presence = await this.safeRequest("system-presence");
    if (presence) {
      const normalizedPresence = this.normalizePresencePayload(presence);
      syncEvents.push(
        this.buildSyncEvent("presence", "system", normalizedPresence)
      );
      const snapshot = parsePresencePayload(normalizedPresence);
      if (snapshot) {
        await this.handlePresenceSnapshot(snapshot);
      }
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
          const rawAgentId = agentIdFromSession(session) ?? "system";
          const agentId = this.normalizeAgentId(rawAgentId) ?? rawAgentId;
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
