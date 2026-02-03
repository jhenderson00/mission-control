// @vitest-environment node
import http from "http";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { BridgeConfig, GatewayConnectionState } from "./types";
import { Bridge } from "./index";

type HealthHarness = {
  url: string;
  close: () => Promise<void>;
  setGatewayState: (state: Partial<GatewayConnectionState>) => void;
  setHealthCheckResult: (result: unknown) => void;
  setHealthCheckError: (error: Error) => void;
};

const baseConfig: BridgeConfig = {
  gatewayUrl: "ws://127.0.0.1:18789",
  gatewayToken: "token",
  convexUrl: "https://convex.test",
  convexSecret: "secret",
  reconnectIntervalMs: 1000,
  maxReconnectAttempts: 1,
  batchSize: 10,
  batchIntervalMs: 100,
  requestTimeoutMs: 1000,
  agentIdAliases: {},
};

async function setupHealthHarness(secret?: string): Promise<HealthHarness> {
  const bridge = new Bridge(baseConfig);

  let gatewayState: GatewayConnectionState = {
    connected: true,
    readyState: 1,
    reconnecting: false,
    reconnectAttempts: 0,
    lastConnectedAt: "2026-02-02T10:00:00Z",
  };

  let healthCheckResult: unknown = { status: "ok", uptime: 12345 };
  let healthCheckError: Error | null = null;

  const gateway = {
    getConnectionState: vi.fn(() => gatewayState),
    healthCheck: vi.fn(async () => {
      if (healthCheckError) {
        throw healthCheckError;
      }
      return healthCheckResult;
    }),
  };

  (bridge as unknown as { gateway: typeof gateway }).gateway = gateway;

  const handler = (bridge as unknown as {
    handleHttpRequest: (
      req: http.IncomingMessage,
      res: http.ServerResponse,
      secret: string | null
    ) => Promise<void>;
  }).handleHttpRequest.bind(bridge);

  const server = http.createServer((req, res) => {
    void handler(req, res, secret ?? null);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start health server");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
    setGatewayState: (state: Partial<GatewayConnectionState>) => {
      gatewayState = { ...gatewayState, ...state };
    },
    setHealthCheckResult: (result: unknown) => {
      healthCheckResult = result;
      healthCheckError = null;
    },
    setHealthCheckError: (error: Error) => {
      healthCheckError = error;
    },
  };
}

describe("bridge health endpoint", () => {
  describe("GET /api/health", () => {
    it("returns ok status when gateway is connected", async () => {
      const harness = await setupHealthHarness();
      try {
        const response = await fetch(`${harness.url}/api/health`);
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.status).toBe("ok");
        expect(body.timestamp).toBeDefined();
        expect(body.gateway.connected).toBe(true);
      } finally {
        await harness.close();
      }
    });

    it("returns degraded status when gateway is disconnected", async () => {
      const harness = await setupHealthHarness();
      try {
        harness.setGatewayState({ connected: false, readyState: 3 });

        const response = await fetch(`${harness.url}/api/health`);
        expect(response.status).toBe(503);

        const body = await response.json();
        expect(body.status).toBe("degraded");
        expect(body.gateway.connected).toBe(false);
      } finally {
        await harness.close();
      }
    });

    it("returns degraded status when gateway is reconnecting", async () => {
      const harness = await setupHealthHarness();
      try {
        harness.setGatewayState({
          connected: false,
          reconnecting: true,
          reconnectAttempts: 2,
        });

        const response = await fetch(`${harness.url}/api/health`);
        expect(response.status).toBe(503);

        const body = await response.json();
        expect(body.status).toBe("degraded");
        expect(body.gateway.reconnecting).toBe(true);
        expect(body.gateway.reconnectAttempts).toBe(2);
      } finally {
        await harness.close();
      }
    });

    it("supports HEAD requests", async () => {
      const harness = await setupHealthHarness();
      try {
        const response = await fetch(`${harness.url}/api/health`, {
          method: "HEAD",
        });
        expect(response.status).toBe(200);

        const text = await response.text();
        expect(text).toBe("");
      } finally {
        await harness.close();
      }
    });

    it("rejects non-GET/HEAD methods", async () => {
      const harness = await setupHealthHarness();
      try {
        const response = await fetch(`${harness.url}/api/health`, {
          method: "POST",
        });
        expect(response.status).toBe(405);
      } finally {
        await harness.close();
      }
    });
  });

  describe("GET /health (alias)", () => {
    it("works as alias for /api/health", async () => {
      const harness = await setupHealthHarness();
      try {
        const response = await fetch(`${harness.url}/health`);
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.status).toBe("ok");
      } finally {
        await harness.close();
      }
    });
  });

  describe("authenticated health check", () => {
    it("includes gateway health when authenticated", async () => {
      const harness = await setupHealthHarness("secret");
      try {
        const response = await fetch(`${harness.url}/api/health`, {
          headers: { authorization: "Bearer secret" },
        });
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.status).toBe("ok");
        expect(body.gateway.health).toEqual({ status: "ok", uptime: 12345 });
      } finally {
        await harness.close();
      }
    });

    it("returns degraded when gateway health check fails", async () => {
      const harness = await setupHealthHarness("secret");
      try {
        harness.setHealthCheckError(new Error("Gateway unreachable"));

        const response = await fetch(`${harness.url}/api/health`, {
          headers: { authorization: "Bearer secret" },
        });
        expect(response.status).toBe(503);

        const body = await response.json();
        expect(body.status).toBe("degraded");
        expect(body.gateway.lastError).toContain("Gateway unreachable");
      } finally {
        await harness.close();
      }
    });

    it("does not include gateway health without auth", async () => {
      const harness = await setupHealthHarness("secret");
      try {
        const response = await fetch(`${harness.url}/api/health`);
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.gateway.health).toBeUndefined();
      } finally {
        await harness.close();
      }
    });

    it("accepts auth via bridge-control-secret header", async () => {
      const harness = await setupHealthHarness("secret");
      try {
        const response = await fetch(`${harness.url}/api/health`, {
          headers: { "bridge-control-secret": "secret" },
        });
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.gateway.health).toBeDefined();
      } finally {
        await harness.close();
      }
    });
  });

  describe("connection state details", () => {
    it("includes lastConnectedAt timestamp", async () => {
      const harness = await setupHealthHarness();
      try {
        harness.setGatewayState({
          lastConnectedAt: "2026-02-02T12:00:00Z",
        });

        const response = await fetch(`${harness.url}/api/health`);
        const body = await response.json();

        expect(body.gateway.lastConnectedAt).toBe("2026-02-02T12:00:00Z");
      } finally {
        await harness.close();
      }
    });

    it("includes lastDisconnectedAt timestamp", async () => {
      const harness = await setupHealthHarness();
      try {
        harness.setGatewayState({
          connected: false,
          lastDisconnectedAt: "2026-02-02T12:30:00Z",
        });

        const response = await fetch(`${harness.url}/api/health`);
        const body = await response.json();

        expect(body.gateway.lastDisconnectedAt).toBe("2026-02-02T12:30:00Z");
      } finally {
        await harness.close();
      }
    });

    it("includes lastError when present", async () => {
      const harness = await setupHealthHarness();
      try {
        harness.setGatewayState({
          connected: false,
          lastError: "Connection reset by peer",
        });

        const response = await fetch(`${harness.url}/api/health`);
        const body = await response.json();

        expect(body.gateway.lastError).toBe("Connection reset by peer");
      } finally {
        await harness.close();
      }
    });
  });

  describe("404 for unknown paths", () => {
    it("returns 404 for unknown paths", async () => {
      const harness = await setupHealthHarness();
      try {
        const response = await fetch(`${harness.url}/unknown`);
        expect(response.status).toBe(404);
      } finally {
        await harness.close();
      }
    });
  });
});
