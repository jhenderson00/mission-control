// @vitest-environment node
import { EventEmitter } from "events";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GatewayClient, parsePresencePayload } from "./gateway-client";
import type { BridgeConfig, HelloOkFrame, PresenceSnapshot } from "./types";

const baseConfig: BridgeConfig = {
  gatewayUrl: "ws://127.0.0.1:18789",
  gatewayToken: "test-token",
  convexUrl: "https://convex.test",
  convexSecret: "secret",
  reconnectIntervalMs: 100,
  maxReconnectAttempts: 3,
  batchSize: 10,
  batchIntervalMs: 100,
  requestTimeoutMs: 500,
  agentIdAliases: {},
};

describe("GatewayClient", () => {
  describe("getConnectionState", () => {
    it("returns disconnected state when not connected", () => {
      const client = new GatewayClient(baseConfig);

      const state = client.getConnectionState();

      expect(state.connected).toBe(false);
      expect(state.readyState).toBeNull();
      expect(state.reconnecting).toBe(false);
      expect(state.reconnectAttempts).toBe(0);
    });
  });

  describe("getHelloSnapshot", () => {
    it("returns null before connection", () => {
      const client = new GatewayClient(baseConfig);

      expect(client.getHelloSnapshot()).toBeNull();
    });
  });

  describe("close", () => {
    it("disables reconnect when close is called", () => {
      const client = new GatewayClient(baseConfig);
      const privateClient = client as unknown as { allowReconnect: boolean };

      // Initially allowReconnect should be true
      expect(privateClient.allowReconnect).toBe(true);

      client.close();

      expect(privateClient.allowReconnect).toBe(false);
    });
  });

  describe("handleMessage", () => {
    let client: GatewayClient;

    beforeEach(() => {
      client = new GatewayClient(baseConfig);
    });

    it("emits event for gateway events", () => {
      const eventHandler = vi.fn();
      client.on("event", eventHandler);

      const handleMessage = (
        client as unknown as { handleMessage: (data: Buffer) => void }
      ).handleMessage.bind(client);

      handleMessage(
        Buffer.from(
          JSON.stringify({
            type: "event",
            event: "agent",
            payload: { agentId: "test", status: "active" },
          })
        )
      );

      expect(eventHandler).toHaveBeenCalledWith({
        type: "event",
        event: "agent",
        payload: { agentId: "test", status: "active" },
      });
    });

    it("emits presence event for presence updates", () => {
      const presenceHandler = vi.fn();
      client.on("presence", presenceHandler);

      const handleMessage = (
        client as unknown as { handleMessage: (data: Buffer) => void }
      ).handleMessage.bind(client);

      const presencePayload = {
        entries: [
          { deviceId: "dev1", agentId: "agent1", connectedAt: "2026-02-02" },
        ],
      };

      handleMessage(
        Buffer.from(
          JSON.stringify({
            type: "event",
            event: "presence",
            payload: presencePayload,
          })
        )
      );

      expect(presenceHandler).toHaveBeenCalled();
      const snapshot = presenceHandler.mock.calls[0][0] as PresenceSnapshot;
      expect(snapshot.entries).toHaveLength(1);
      expect(snapshot.entries[0].deviceId).toBe("dev1");
    });

    it("emits hello event for hello-ok frame", () => {
      const helloHandler = vi.fn();
      client.on("hello", helloHandler);

      const handleMessage = (
        client as unknown as { handleMessage: (data: Buffer) => void }
      ).handleMessage.bind(client);

      const helloFrame: HelloOkFrame = {
        type: "hello-ok",
        presence: { entries: [] },
        features: { methods: ["health", "send"] },
      };

      handleMessage(Buffer.from(JSON.stringify(helloFrame)));

      expect(helloHandler).toHaveBeenCalledWith(helloFrame);
      expect(client.getHelloSnapshot()).toEqual(helloFrame);
    });

    it("emits challenge event for connect.challenge", () => {
      const challengeHandler = vi.fn();
      client.on("challenge", challengeHandler);

      const handleMessage = (
        client as unknown as { handleMessage: (data: Buffer) => void }
      ).handleMessage.bind(client);

      handleMessage(
        Buffer.from(
          JSON.stringify({
            type: "event",
            event: "connect.challenge",
            payload: { nonce: "test-nonce" },
          })
        )
      );

      expect(challengeHandler).toHaveBeenCalledWith("test-nonce");
    });

    it("resolves pending requests on successful response", () => {
      const client = new GatewayClient(baseConfig);
      const pending = new Map<
        string,
        {
          resolve: (value: unknown) => void;
          reject: (error: Error) => void;
          timeout: NodeJS.Timeout;
        }
      >();
      (client as unknown as { pending: typeof pending }).pending = pending;

      const resolveHandler = vi.fn();
      const rejectHandler = vi.fn();
      const timeout = setTimeout(() => {}, 5000);

      pending.set("req_1", {
        resolve: resolveHandler,
        reject: rejectHandler,
        timeout,
      });

      const handleMessage = (
        client as unknown as { handleMessage: (data: Buffer) => void }
      ).handleMessage.bind(client);

      handleMessage(
        Buffer.from(
          JSON.stringify({
            type: "res",
            id: "req_1",
            ok: true,
            result: { status: "healthy" },
          })
        )
      );

      expect(resolveHandler).toHaveBeenCalledWith({ status: "healthy" });
      expect(rejectHandler).not.toHaveBeenCalled();
      expect(pending.has("req_1")).toBe(false);
      clearTimeout(timeout);
    });

    it("rejects pending requests on error response", () => {
      const client = new GatewayClient(baseConfig);
      const pending = new Map<
        string,
        {
          resolve: (value: unknown) => void;
          reject: (error: Error) => void;
          timeout: NodeJS.Timeout;
        }
      >();
      (client as unknown as { pending: typeof pending }).pending = pending;

      const resolveHandler = vi.fn();
      const rejectHandler = vi.fn();
      const timeout = setTimeout(() => {}, 5000);

      pending.set("req_2", {
        resolve: resolveHandler,
        reject: rejectHandler,
        timeout,
      });

      const handleMessage = (
        client as unknown as { handleMessage: (data: Buffer) => void }
      ).handleMessage.bind(client);

      handleMessage(
        Buffer.from(
          JSON.stringify({
            type: "res",
            id: "req_2",
            ok: false,
            error: { message: "Unknown method" },
          })
        )
      );

      expect(rejectHandler).toHaveBeenCalled();
      expect(rejectHandler.mock.calls[0][0].message).toBe("Unknown method");
      expect(resolveHandler).not.toHaveBeenCalled();
      clearTimeout(timeout);
    });

    it("handles invalid JSON gracefully", () => {
      const errorHandler = vi.fn();
      client.on("error", errorHandler);

      const handleMessage = (
        client as unknown as { handleMessage: (data: Buffer) => void }
      ).handleMessage.bind(client);

      handleMessage(Buffer.from("not valid json"));

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe("handleClose", () => {
    it("emits disconnected event", () => {
      const client = new GatewayClient(baseConfig);
      const disconnectHandler = vi.fn();
      client.on("disconnected", disconnectHandler);

      // Disable reconnect to prevent side effects
      (client as unknown as { allowReconnect: boolean }).allowReconnect = false;

      const handleClose = (
        client as unknown as { handleClose: () => void }
      ).handleClose.bind(client);

      handleClose();

      expect(disconnectHandler).toHaveBeenCalled();
    });

    it("sets lastDisconnectedAt timestamp", () => {
      const client = new GatewayClient(baseConfig);
      (client as unknown as { allowReconnect: boolean }).allowReconnect = false;

      const handleClose = (
        client as unknown as { handleClose: () => void }
      ).handleClose.bind(client);

      handleClose();

      const state = client.getConnectionState();
      expect(state.lastDisconnectedAt).toBeDefined();
    });

    it("rejects all pending requests", () => {
      const client = new GatewayClient(baseConfig);
      const pending = new Map<
        string,
        {
          resolve: (value: unknown) => void;
          reject: (error: Error) => void;
          timeout: NodeJS.Timeout;
        }
      >();
      (client as unknown as { pending: typeof pending }).pending = pending;
      (client as unknown as { allowReconnect: boolean }).allowReconnect = false;

      const rejectHandler1 = vi.fn();
      const rejectHandler2 = vi.fn();
      const timeout1 = setTimeout(() => {}, 5000);
      const timeout2 = setTimeout(() => {}, 5000);

      pending.set("req_1", {
        resolve: vi.fn(),
        reject: rejectHandler1,
        timeout: timeout1,
      });
      pending.set("req_2", {
        resolve: vi.fn(),
        reject: rejectHandler2,
        timeout: timeout2,
      });

      const handleClose = (
        client as unknown as { handleClose: () => void }
      ).handleClose.bind(client);

      handleClose();

      expect(rejectHandler1).toHaveBeenCalled();
      expect(rejectHandler2).toHaveBeenCalled();
      expect(pending.size).toBe(0);
      clearTimeout(timeout1);
      clearTimeout(timeout2);
    });
  });

  describe("handleError", () => {
    it("emits error event", () => {
      const client = new GatewayClient(baseConfig);
      const errorHandler = vi.fn();
      client.on("error", errorHandler);

      const handleError = (
        client as unknown as { handleError: (error: Error) => void }
      ).handleError.bind(client);

      const testError = new Error("Test error");
      handleError(testError);

      expect(errorHandler).toHaveBeenCalledWith(testError);
    });

    it("stores lastError", () => {
      const client = new GatewayClient(baseConfig);
      (client as unknown as { allowReconnect: boolean }).allowReconnect = false;

      // Need to add error listener to prevent unhandled error
      client.on("error", () => {});

      const handleError = (
        client as unknown as { handleError: (error: Error) => void }
      ).handleError.bind(client);

      handleError(new Error("Connection failed"));

      const state = client.getConnectionState();
      expect(state.lastError).toBe("Connection failed");
    });
  });

  describe("scheduleReconnect", () => {
    it("emits fatal when max reconnect attempts exceeded", () => {
      const client = new GatewayClient({
        ...baseConfig,
        maxReconnectAttempts: 2,
      });

      const fatalHandler = vi.fn();
      client.on("fatal", fatalHandler);

      (client as unknown as { reconnectAttempts: number }).reconnectAttempts =
        2;
      (client as unknown as { allowReconnect: boolean }).allowReconnect = true;

      const scheduleReconnect = (
        client as unknown as { scheduleReconnect: () => void }
      ).scheduleReconnect.bind(client);

      scheduleReconnect();

      expect(fatalHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Max reconnect attempts exceeded",
        })
      );
    });

    it("does not schedule reconnect when already reconnecting", () => {
      const client = new GatewayClient(baseConfig);

      (client as unknown as { reconnecting: boolean }).reconnecting = true;
      (client as unknown as { reconnectAttempts: number }).reconnectAttempts =
        0;
      (client as unknown as { allowReconnect: boolean }).allowReconnect = true;

      const scheduleReconnect = (
        client as unknown as { scheduleReconnect: () => void }
      ).scheduleReconnect.bind(client);

      scheduleReconnect();

      // Should still be marked as reconnecting, no additional schedule
      expect(
        (client as unknown as { reconnecting: boolean }).reconnecting
      ).toBe(true);
    });
  });

  describe("request", () => {
    it("throws when socket is not connected", async () => {
      const client = new GatewayClient(baseConfig);

      await expect(client.request("health")).rejects.toThrow(
        "Gateway socket is not connected"
      );
    });
  });
});

describe("parsePresencePayload", () => {
  it("parses valid presence payload", () => {
    const payload = {
      entries: [
        {
          deviceId: "device1",
          agentId: "agent1",
          sessionKey: "agent:agent1:main",
          roles: ["operator"],
          connectedAt: "2026-02-02T10:00:00Z",
        },
        {
          deviceId: "device2",
          agent_id: "agent2",
          session_key: "agent:agent2:main",
        },
      ],
    };

    const result = parsePresencePayload(payload);

    expect(result).not.toBeNull();
    expect(result?.entries).toHaveLength(2);
    expect(result?.entries[0].deviceId).toBe("device1");
    expect(result?.entries[0].agentId).toBe("agent1");
    expect(result?.entries[0].sessionKey).toBe("agent:agent1:main");
    expect(result?.entries[1].agentId).toBe("agent2");
  });

  it("returns null for invalid payload", () => {
    expect(parsePresencePayload(null)).toBeNull();
    expect(parsePresencePayload(undefined)).toBeNull();
    expect(parsePresencePayload("string")).toBeNull();
    expect(parsePresencePayload({ entries: "not-array" })).toBeNull();
  });

  it("filters out invalid entries", () => {
    const payload = {
      entries: [
        { deviceId: "valid", agentId: "agent1" },
        { agentId: "missing-deviceId" },
        null,
        "invalid",
      ],
    };

    const result = parsePresencePayload(payload);

    expect(result?.entries).toHaveLength(1);
    expect(result?.entries[0].deviceId).toBe("valid");
  });

  it("includes observedAt timestamp", () => {
    const payload = { entries: [] };
    const result = parsePresencePayload(payload);

    expect(result?.observedAt).toBeDefined();
    expect(new Date(result!.observedAt).getTime()).toBeLessThanOrEqual(
      Date.now()
    );
  });

  it("handles entries with scopes and roles", () => {
    const payload = {
      entries: [
        {
          deviceId: "dev1",
          roles: ["admin", "operator"],
          scopes: ["read", "write"],
          lastSeen: "2026-02-02T12:00:00Z",
        },
      ],
    };

    const result = parsePresencePayload(payload);

    expect(result?.entries[0].roles).toEqual(["admin", "operator"]);
    expect(result?.entries[0].scopes).toEqual(["read", "write"]);
    expect(result?.entries[0].lastSeen).toBe("2026-02-02T12:00:00Z");
  });
});
