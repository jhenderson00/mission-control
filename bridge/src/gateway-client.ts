import { EventEmitter } from "events";
import WebSocket from "ws";
import type {
  BridgeConfig,
  GatewayEvent,
  GatewayFrame,
  GatewayRequest,
  GatewayResponse,
  HelloOkFrame,
} from "./types";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type ConnectSnapshot = HelloOkFrame | null;

export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pending = new Map<string, PendingRequest>();
  private reconnectAttempts = 0;
  private reconnecting = false;
  private allowReconnect = true;
  private helloSnapshot: ConnectSnapshot = null;

  constructor(private readonly config: BridgeConfig) {
    super();
  }

  async connect(): Promise<void> {
    this.helloSnapshot = null;
    await this.openSocket();
    await this.authenticate();
    this.reconnectAttempts = 0;
    this.emit("connected", this.helloSnapshot);
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
    const result = await this.request("connect", {
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
      auth: { token: this.config.gatewayToken },
    });

    if (isHelloOkFrame(result)) {
      this.helloSnapshot = result;
      this.emit("hello", result);
      return;
    }

    if (this.helloSnapshot) {
      return;
    }

    throw new Error("Gateway connect handshake failed");
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
          pending.resolve(response.result);
        } else {
          pending.reject(new Error(response.error?.message ?? "Gateway error"));
        }
      }
      return;
    }

    if (frame.type === "event") {
      this.emit("event", frame as GatewayEvent);
      return;
    }

    if (frame.type === "hello-ok") {
      this.helloSnapshot = frame as HelloOkFrame;
      this.emit("hello", frame as HelloOkFrame);
    }
  }

  private handleClose(): void {
    this.emit("disconnected");
    this.rejectPending(new Error("Gateway connection closed"));
    if (this.allowReconnect) {
      this.scheduleReconnect();
    }
  }

  private handleError(error: Error): void {
    this.emit("error", error);
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
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
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
