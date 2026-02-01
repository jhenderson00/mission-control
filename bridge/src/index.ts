import { randomUUID } from "crypto";
import http from "http";
import { ConvexClient } from "./convex-client";
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

function resolveSessionKeyForAgent(
  agentId: string,
  params: Record<string, unknown>
): string {
  return resolveString(params.sessionKey) ?? `agent:${agentId}:main`;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

type ParsedControlPayload = {
  agentId?: string;
  agentIds?: string[];
  command: ControlCommand;
  params: Record<string, unknown>;
  requestId?: string;
  requestedBy?: string;
};

type ControlCommand =
  | "pause"
  | "resume"
  | "redirect"
  | "kill"
  | "restart"
  | "priority";

class ControlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControlValidationError";
  }
}

function normalizeCommand(command: string): ControlCommand | null {
  switch (command) {
    case "pause":
    case "resume":
    case "redirect":
    case "kill":
    case "restart":
    case "priority":
      return command;
    case "agent.pause":
      return "pause";
    case "agent.resume":
      return "resume";
    case "agent.redirect":
      return "redirect";
    case "agent.kill":
      return "kill";
    case "agent.restart":
      return "restart";
    case "agent.priority.override":
    case "agent.priority":
      return "priority";
    default:
      return null;
  }
}

function normalizeAgentIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const agentIds = value.filter((id) => typeof id === "string" && id.length > 0);
  return agentIds.length === value.length ? agentIds : null;
}

function parseControlPayload(payload: unknown): ParsedControlPayload {
  if (!isRecord(payload)) {
    throw new ControlValidationError("Invalid control payload");
  }

  const rawCommand = resolveString(payload.command) ?? resolveString(payload.method);
  const rawParams = payload.params;
  if (rawParams !== undefined && !isRecord(rawParams)) {
    throw new ControlValidationError("Invalid params");
  }
  const params = isRecord(rawParams) ? rawParams : {};
  const requestedBy = resolveString(payload.requestedBy);
  const requestId =
    resolveString(payload.requestId) ?? resolveString(params.requestId);

  if (!rawCommand) {
    throw new ControlValidationError("Invalid control command");
  }

  if (rawCommand === "agents.bulk") {
    const nestedCommandRaw = resolveString(params.command);
    const nestedCommand = nestedCommandRaw
      ? normalizeCommand(nestedCommandRaw)
      : null;
    const agentIds = normalizeAgentIds(params.agentIds);
    const nestedParams = isRecord(params.params) ? params.params : {};
    const nestedRequestId = resolveString(params.requestId) ?? requestId;

    if (!nestedCommand) {
      throw new ControlValidationError("Invalid bulk command");
    }
    if (!agentIds) {
      throw new ControlValidationError("Invalid bulk agentIds");
    }

    return {
      agentIds,
      command: nestedCommand,
      params: nestedParams,
      requestId: nestedRequestId,
      requestedBy,
    };
  }

  const command = normalizeCommand(rawCommand);
  if (!command) {
    throw new ControlValidationError("Unsupported control command");
  }

  const agentId =
    resolveString(payload.agentId) ?? resolveString(params.agentId);

  if (!agentId) {
    throw new ControlValidationError("Missing agentId");
  }

  return {
    agentId,
    command,
    params,
    requestId,
    requestedBy,
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
        "heartbeat",
        "health",
      ]);
      await this.gateway.subscribePresence();
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

    switch (command) {
      case "pause": {
        await this.gateway.send(sessionKey, "/stop");
        this.pausedAgents.add(agentId);
        void this.updateManualStatus(agentId, "paused", sessionKey);
        return { requestId, status: "accepted" };
      }
      case "resume": {
        const text =
          resolveString(params.text) ??
          resolveString(params.message) ??
          "Resume work";
        await this.gateway.call("cron.wake", { text, mode: "now" });
        this.pausedAgents.delete(agentId);
        void this.updateManualStatus(agentId, "busy", sessionKey);
        return { requestId, status: "accepted" };
      }
      case "redirect": {
        const payload =
          params.taskPayload ?? params.text ?? params.message ?? params.task;
        if (payload === undefined) {
          throw new ControlValidationError("Missing task payload");
        }
        let message: string;
        if (typeof payload === "string") {
          message = payload;
        } else {
          const serialized = JSON.stringify(payload);
          message = serialized ?? String(payload);
        }
        await this.gateway.send(sessionKey, message);
        this.pausedAgents.delete(agentId);
        void this.updateManualStatus(agentId, "busy", sessionKey);
        return { requestId, status: "accepted" };
      }
      case "kill": {
        await this.gateway.send(sessionKey, "/stop");
        await this.gateway.send(sessionKey, "/reset");
        return { requestId, status: "accepted" };
      }
      case "restart": {
        await this.gateway.send(sessionKey, "/new");
        this.pausedAgents.delete(agentId);
        void this.updateManualStatus(agentId, "busy", sessionKey);
        return { requestId, status: "accepted" };
      }
      case "priority": {
        const priority =
          resolveString(params.priority) ??
          (typeof params.priority === "number"
            ? String(params.priority)
            : null);
        if (!priority) {
          throw new ControlValidationError("Missing priority");
        }
        await this.gateway.send(sessionKey, `/queue priority:${priority}`);
        return { requestId, status: "accepted" };
      }
    }
  }

  private handleGatewayEvent(frame: GatewayEvent): void {
    const now = Date.now();
    if (this.lastEventTime && now - this.lastEventTime > DEFAULTS.gapThresholdMs) {
      console.warn("[bridge] detected gap, triggering state sync");
      void this.initialSync(null);
    }
    this.lastEventTime = now;

    this.trackSessionActivity(frame);
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

  private trackSessionActivity(frame: GatewayEvent): void {
    if (frame.event !== "agent" && frame.event !== "chat") {
      return;
    }

    const payload = frame.payload;
    const sessionKey = resolveSessionKey(payload);
    const agentId =
      agentIdFromSessionKey(sessionKey) ?? resolveAgentId(payload, "");

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
      const agentId = entry.deviceId;
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

    if (hello?.presence) {
      syncEvents.push(this.buildSyncEvent("presence", "system", hello.presence));
      const snapshot = parsePresencePayload(hello.presence);
      if (snapshot) {
        await this.handlePresenceSnapshot(snapshot);
      }
    }
    if (hello?.health) {
      syncEvents.push(this.buildSyncEvent("health", "system", hello.health));
    }

    const presence = await this.safeRequest("system-presence");
    if (presence) {
      syncEvents.push(this.buildSyncEvent("presence", "system", presence));
      const snapshot = parsePresencePayload(presence);
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
