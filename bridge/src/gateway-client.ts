import { EventEmitter } from "events";
import WebSocket from "ws";
import type {
  BridgeConfig,
  GatewayEvent,
  GatewayFrame,
  GatewayConnectionState,
  GatewayRequest,
  GatewayResponse,
  HelloOkFrame,
  PresenceEntry,
  PresenceSnapshot,
} from "./types";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type ConnectSnapshot = HelloOkFrame | null;

function resolveString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function resolveStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.filter((item) => typeof item === "string") as string[];
  return strings.length > 0 ? strings : undefined;
}

function parsePresenceEntry(value: unknown): PresenceEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const deviceId = resolveString(record.deviceId);
  if (!deviceId) {
    return null;
  }
  const agentId =
    resolveString(record.agentId) ?? resolveString(record.agent_id);
  const sessionKey =
    resolveString(record.sessionKey) ?? resolveString(record.session_key);

  return {
    deviceId,
    agentId,
    sessionKey,
    roles: resolveStringArray(record.roles),
    scopes: resolveStringArray(record.scopes),
    connectedAt: resolveString(record.connectedAt),
    lastSeen: resolveString(record.lastSeen),
  };
}

export function parsePresencePayload(payload: unknown): PresenceSnapshot | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const entriesRaw = record.entries;
  if (!Array.isArray(entriesRaw)) {
    return null;
  }

  const entries = entriesRaw
    .map((entry) => parsePresenceEntry(entry))
    .filter((entry): entry is PresenceEntry => Boolean(entry));

  return {
    entries,
    observedAt: new Date().toISOString(),
  };
}

export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pending = new Map<string, PendingRequest>();
  private reconnectAttempts = 0;
  private reconnecting = false;
  private allowReconnect = true;
  private helloSnapshot: ConnectSnapshot = null;
  private pendingChallengeNonce: string | null = null;
  private lastConnectedAt: string | null = null;
  private lastDisconnectedAt: string | null = null;
  private lastError: Error | null = null;

  constructor(private readonly config: BridgeConfig) {
    super();
  }

  async connect(): Promise<void> {
    this.helloSnapshot = null;
    this.pendingChallengeNonce = null;
    this.lastError = null;
    await this.openSocket();
    await this.authenticate();
    this.reconnectAttempts = 0;
    this.lastConnectedAt = new Date().toISOString();
    this.emit("connected", this.helloSnapshot);
  }

  async start(): Promise<void> {
    try {
      await this.connect();
    } catch (error) {
      this.emit("error", error as Error);
      this.scheduleReconnect();
    }
  }

  async call(method: string, params?: unknown): Promise<unknown> {
    return this.request(method, params);
  }

  async send(sessionKey: string, message: string): Promise<unknown> {
    return this.request("send", { sessionKey, message });
  }

  async healthCheck(): Promise<unknown> {
    return this.request("health");
  }

  getConnectionState(): GatewayConnectionState {
    const readyState = this.ws ? this.ws.readyState : null;
    const connected = readyState === WebSocket.OPEN;
    return {
      connected,
      readyState,
      reconnecting: this.reconnecting,
      reconnectAttempts: this.reconnectAttempts,
      lastConnectedAt: this.lastConnectedAt ?? undefined,
      lastDisconnectedAt: this.lastDisconnectedAt ?? undefined,
      lastError: this.lastError?.message,
    };
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Gateway socket is not connected");
    }

    const id = `req_${++this.requestId}`;
    const payload: GatewayRequest = {
      type: "req",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Gateway request timeout: ${method}`));
      }, this.config.requestTimeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      ws.send(JSON.stringify(payload));
    });
  }

  async subscribe(events: string[]): Promise<void> {
    await this.request("subscribe", { events });
  }

  async subscribePresence(): Promise<void> {
    await this.subscribe(["presence"]);
  }

  getHelloSnapshot(): ConnectSnapshot {
    return this.helloSnapshot;
  }

  close(): void {
    this.allowReconnect = false;
    this.ws?.close();
  }

  private async openSocket(): Promise<void> {
    this.ws?.removeAllListeners();
    this.ws?.terminate();

    this.ws = new WebSocket(this.config.gatewayUrl);

    this.ws.on("message", (data) => this.handleMessage(data));
    this.ws.on("close", () => this.handleClose());
    this.ws.on("error", (error) => this.handleError(error as Error));

    await new Promise<void>((resolve, reject) => {
      if (!this.ws) {
        reject(new Error("WebSocket not initialized"));
        return;
      }
      this.ws.once("open", () => resolve());
      this.ws.once("error", (error) => reject(error));
    });
  }

  private async authenticate(): Promise<void> {
    // Wait briefly for connect.challenge event from gateway when present.
    const nonce = await this.waitForChallenge(1000, true);

    const baseParams = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "mission-control-bridge",
        version: "1.0.0",
        platform: "node",
        mode: "operator",
      },
      role: "operator",
      scopes: ["operator.read"],
    };

    // Connect after challenge; gateway token auth does not accept nonce in params.
    void nonce;
    const connectParams = {
      ...baseParams,
      auth: { token: this.config.gatewayToken },
    };

    const connectAttempt = this.request("connect", connectParams)
      .then((result) => ({ kind: "connect" as const, result }))
      .catch((error) => ({ kind: "connect-error" as const, error }));

    const helloAttempt = this.waitForHello()
      .then((result) => ({ kind: "hello" as const, result }))
      .catch((error) => ({ kind: "hello-error" as const, error }));

    const first = await Promise.race([connectAttempt, helloAttempt]);
    let second:
      | Awaited<typeof connectAttempt>
      | Awaited<typeof helloAttempt>
      | null = null;

    let hello =
      first.kind === "hello"
        ? first.result
        : first.kind === "connect"
          ? extractHelloOk(first.result)
          : null;

    if (!hello) {
      second =
        first.kind === "hello" || first.kind === "hello-error"
          ? await connectAttempt
          : await helloAttempt;
      hello =
        second.kind === "hello"
          ? second.result
          : second.kind === "connect"
            ? extractHelloOk(second.result)
            : null;
    }

    if (hello) {
      this.helloSnapshot = hello;
      this.emit("hello", hello);
      return;
    }

    const error =
      first.kind === "connect-error"
        ? first.error
        : first.kind === "hello-error"
          ? first.error
          : second?.kind === "connect-error"
            ? second.error
            : second?.kind === "hello-error"
              ? second.error
              : null;
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Gateway connect handshake failed");
  }

  private waitForChallenge(
    timeoutMs = this.config.requestTimeoutMs,
    optional = false
  ): Promise<string | null> {
    const cached = this.pendingChallengeNonce;
    if (cached) {
      this.pendingChallengeNonce = null;
      return Promise.resolve(cached);
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const handler = (nonce: string) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        this.removeListener("challenge", handler);
        resolve(nonce);
      };

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        this.removeListener("challenge", handler);
        if (optional) {
          resolve(null);
          return;
        }
        reject(new Error("Timeout waiting for connect.challenge"));
      }, timeoutMs);

      this.on("challenge", handler);

      const late = this.pendingChallengeNonce;
      if (late && !settled) {
        this.pendingChallengeNonce = null;
        handler(late);
      }
    });
  }

  private waitForHello(): Promise<HelloOkFrame> {
    const cached = this.helloSnapshot;
    if (cached) {
      return Promise.resolve(cached);
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const handler = (frame: HelloOkFrame) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        this.removeListener("hello", handler);
        resolve(frame);
      };

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        this.removeListener("hello", handler);
        reject(new Error("Timeout waiting for hello-ok"));
      }, this.config.requestTimeoutMs);

      this.on("hello", handler);
    });
  }

  private handleMessage(data: WebSocket.RawData): void {
    let frame: GatewayFrame;
    try {
      frame = JSON.parse(data.toString()) as GatewayFrame;
    } catch (error) {
      this.emit("error", error);
      return;
    }

    if (frame.type === "res") {
      const response = frame as GatewayResponse;
      const pending = this.pending.get(response.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(response.id);
        if (response.ok) {
          const payload =
            response.result !== undefined ? response.result : response.payload;
          pending.resolve(payload);
        } else {
          pending.reject(new Error(response.error?.message ?? "Gateway error"));
        }
      }
      return;
    }

    if (frame.type === "event") {
      const event = frame as GatewayEvent;
      if (event.event === "connect.challenge") {
        const payload = event.payload as { nonce?: string } | undefined;
        const nonce = payload?.nonce;
        if (nonce) {
          this.pendingChallengeNonce = nonce;
          this.emit("challenge", nonce);
        }
      }
      this.emit("event", event);
      if (event.event === "presence") {
        const snapshot = parsePresencePayload(event.payload);
        if (snapshot) {
          this.emit("presence", snapshot);
        }
      }
      return;
    }

    if (frame.type === "hello-ok") {
      this.helloSnapshot = frame as HelloOkFrame;
      this.emit("hello", frame as HelloOkFrame);
    }
  }

  private handleClose(): void {
    this.lastDisconnectedAt = new Date().toISOString();
    this.emit("disconnected");
    this.rejectPending(new Error("Gateway connection closed"));
    if (this.allowReconnect) {
      this.scheduleReconnect();
    }
  }

  private handleError(error: Error): void {
    this.lastError = error;
    this.emit("error", error);
    if (!this.allowReconnect) {
      return;
    }
    const ws = this.ws;
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.terminate();
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private scheduleReconnect(): void {
    if (this.reconnecting) {
      return;
    }
    const maxAttempts = this.config.maxReconnectAttempts;
    if (maxAttempts > 0 && this.reconnectAttempts >= maxAttempts) {
      this.emit("fatal", new Error("Max reconnect attempts exceeded"));
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts += 1;
    const delay = Math.min(
      this.config.reconnectIntervalMs * 2 ** (this.reconnectAttempts - 1),
      60000
    );

    setTimeout(async () => {
      this.reconnecting = false;
      try {
        await this.connect();
      } catch (error) {
        this.emit("error", error);
        this.scheduleReconnect();
      }
    }, delay);
  }
}

function isHelloOkFrame(payload: unknown): payload is HelloOkFrame {
  return (
    !!payload &&
    typeof payload === "object" &&
    (payload as { type?: string }).type === "hello-ok"
  );
}

function extractHelloOk(payload: unknown): HelloOkFrame | null {
  if (isHelloOkFrame(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as { result?: unknown; payload?: unknown };
  if (isHelloOkFrame(record.result)) {
    return record.result;
  }
  if (isHelloOkFrame(record.payload)) {
    return record.payload;
  }
  return null;
}
