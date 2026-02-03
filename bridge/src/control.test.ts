// @vitest-environment node
import http from "http";
import { describe, expect, it, vi } from "vitest";
import type { BridgeConfig } from "./types";
import { Bridge } from "./index";

type GatewayCall =
  | { type: "send"; sessionKey: string; message: string }
  | { type: "call"; method: string; params?: unknown };

type BridgeHarness = {
  url: string;
  close: () => Promise<void>;
  gatewayCalls: GatewayCall[];
  gateway: {
    send: (sessionKey: string, message: string) => Promise<void>;
    call: (method: string, params?: unknown) => Promise<void>;
  };
  convex: {
    updateAgentStatuses: ReturnType<typeof vi.fn>;
  };
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

async function setupHarness(secret = "secret"): Promise<BridgeHarness> {
  const bridge = new Bridge(baseConfig);
  const gatewayCalls: GatewayCall[] = [];
  const gateway = {
    send: vi.fn(async (sessionKey: string, message: string) => {
      gatewayCalls.push({ type: "send", sessionKey, message });
    }),
    call: vi.fn(async (method: string, params?: unknown) => {
      gatewayCalls.push({ type: "call", method, params });
    }),
  };
  const convex = {
    updateAgentStatuses: vi.fn(async () => {}),
  };

  (bridge as unknown as { gateway: typeof gateway }).gateway = gateway;
  (bridge as unknown as { convex: typeof convex }).convex = convex;

  const handler = (bridge as unknown as {
    handleControlRequest: (
      req: http.IncomingMessage,
      res: http.ServerResponse,
      secret: string
    ) => Promise<void>;
  }).handleControlRequest.bind(bridge);

  const server = http.createServer((req, res) => {
    void handler(req, res, secret);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start control server");
  }

  return {
    url: `http://127.0.0.1:${address.port}/api/control`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
    gatewayCalls,
    gateway,
    convex,
  };
}

async function postJson(
  url: string,
  payload: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  return await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

describe("bridge control endpoint", () => {
  it("rejects missing or invalid auth", async () => {
    const harness = await setupHarness();
    try {
      const missing = await postJson(harness.url, {
        agentId: "agent_1",
        command: "agent.pause",
      });
      expect(missing.status).toBe(401);

      const invalid = await postJson(
        harness.url,
        { agentId: "agent_1", command: "agent.pause" },
        { authorization: "Bearer wrong" }
      );
      expect(invalid.status).toBe(401);
    } finally {
      await harness.close();
    }
  });

  it("accepts auth via bridge-control-secret header", async () => {
    const harness = await setupHarness();
    try {
      const response = await postJson(
        harness.url,
        { agentId: "agent_1", command: "agent.pause" },
        { "bridge-control-secret": "secret" }
      );
      expect(response.status).toBe(200);
      const ack = await response.json();
      expect(ack.status).toBe("accepted");
    } finally {
      await harness.close();
    }
  });

  it("rejects invalid json payloads", async () => {
    const harness = await setupHarness();
    try {
      const response = await fetch(harness.url, {
        method: "POST",
        headers: { authorization: "Bearer secret" },
        body: "{",
      });
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toContain("Invalid JSON");
    } finally {
      await harness.close();
    }
  });

  it("rejects invalid payloads", async () => {
    const harness = await setupHarness();
    try {
      const response = await postJson(
        harness.url,
        { command: "agent.pause" },
        { authorization: "Bearer secret" }
      );
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toContain("Missing agentId");
    } finally {
      await harness.close();
    }
  });

  it("rejects payloads that exceed the size limit", async () => {
    const harness = await setupHarness();
    try {
      const oversized = `{"agentId":"agent_1","command":"agent.pause","params":{"blob":"${"a".repeat(
        1024 * 1024 + 10
      )}"}}`;

      const response = await fetch(harness.url, {
        method: "POST",
        headers: { authorization: "Bearer secret" },
        body: oversized,
      });

      expect(response.status).toBe(413);
    } finally {
      await harness.close();
    }
  });

  it("translates pause/resume commands into gateway actions", async () => {
    const harness = await setupHarness();
    try {
      const pause = await postJson(
        harness.url,
        { agentId: "agent_alpha", command: "agent.pause" },
        { authorization: "Bearer secret" }
      );
      expect(pause.status).toBe(200);

      const resume = await postJson(
        harness.url,
        { agentId: "agent_alpha", command: "agent.resume" },
        { authorization: "Bearer secret" }
      );
      expect(resume.status).toBe(200);

      expect(harness.gatewayCalls).toEqual([
        {
          type: "send",
          sessionKey: "agent:agent_alpha:main",
          message: "/stop",
        },
        {
          type: "call",
          method: "cron.wake",
          params: { text: "Resume work", mode: "now" },
        },
      ]);
    } finally {
      await harness.close();
    }
  });

  it("executes bulk control per agent", async () => {
    const harness = await setupHarness();
    try {
      const response = await postJson(
        harness.url,
        { agentIds: ["agent_a", "agent_b"], command: "agent.pause" },
        { authorization: "Bearer secret" }
      );
      const ack = await response.json();
      expect(ack.status).toBe("accepted");
      expect(harness.gatewayCalls).toEqual([
        { type: "send", sessionKey: "agent:agent_a:main", message: "/stop" },
        { type: "send", sessionKey: "agent:agent_b:main", message: "/stop" },
      ]);
    } finally {
      await harness.close();
    }
  });

  it("returns error ack when gateway throws", async () => {
    const harness = await setupHarness();
    try {
      harness.gateway.send = vi.fn(async () => {
        throw new Error("Gateway down");
      });

      const response = await postJson(
        harness.url,
        { agentId: "agent_1", command: "agent.pause" },
        { authorization: "Bearer secret" }
      );
      const ack = await response.json();
      expect(ack.status).toBe("error");
      expect(ack.error).toContain("Gateway down");
    } finally {
      await harness.close();
    }
  });

  it("returns rejected ack on validation errors", async () => {
    const harness = await setupHarness();
    try {
      const response = await postJson(
        harness.url,
        { agentId: "agent_1", command: "agent.redirect", params: {} },
        { authorization: "Bearer secret" }
      );
      const ack = await response.json();
      expect(ack.status).toBe("rejected");
      expect(ack.error).toContain("Missing task payload");
    } finally {
      await harness.close();
    }
  });

  it("updates manual status for pause/resume/redirect/restart", async () => {
    const harness = await setupHarness();
    try {
      await postJson(
        harness.url,
        { agentId: "agent_manual", command: "agent.pause" },
        { authorization: "Bearer secret" }
      );
      await postJson(
        harness.url,
        { agentId: "agent_manual", command: "agent.resume" },
        { authorization: "Bearer secret" }
      );
      await postJson(
        harness.url,
        {
          agentId: "agent_manual",
          command: "agent.redirect",
          params: { taskId: "task_1" },
        },
        { authorization: "Bearer secret" }
      );
      await postJson(
        harness.url,
        { agentId: "agent_manual", command: "agent.restart" },
        { authorization: "Bearer secret" }
      );

      const statuses = harness.convex.updateAgentStatuses.mock.calls.map(
        (call) => call[0][0].status
      );
      expect(statuses).toEqual(["paused", "busy", "busy", "busy"]);
    } finally {
      await harness.close();
    }
  });
});
