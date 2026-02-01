// @vitest-environment node
import http from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as controls from "./controls";
import { createMockCtx } from "@/test/convex-test-utils";
import {
  buildGatewayActions,
  ControlValidationError,
  executeGatewayActions,
  normalizeCommand,
  parseControlPayload,
  resolveSessionKeyForAgent,
} from "../bridge/src/control-commands";

type GatewayCall =
  | { type: "send"; sessionKey: string; message: string }
  | { type: "call"; method: string; params?: unknown };

type MockGateway = {
  calls: GatewayCall[];
  send: (sessionKey: string, message: string) => Promise<void>;
  call: (method: string, params?: unknown) => Promise<void>;
  failWith: (error: Error | null) => void;
  reset: () => void;
};

function createMockGateway(): MockGateway {
  const calls: GatewayCall[] = [];
  let failure: Error | null = null;

  return {
    calls,
    failWith: (error) => {
      failure = error;
    },
    reset: () => {
      calls.length = 0;
      failure = null;
    },
    send: async (sessionKey, message) => {
      if (failure) {
        throw failure;
      }
      calls.push({ type: "send", sessionKey, message });
    },
    call: async (method, params) => {
      if (failure) {
        throw failure;
      }
      calls.push({ type: "call", method, params });
    },
  };
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString();
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

async function createMockBridgeServer(
  gateway: MockGateway,
  secret: string
): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method !== "POST" || url.pathname !== "/api/control") {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    const auth = req.headers.authorization;
    if (auth !== `Bearer ${secret}`) {
      res.statusCode = 401;
      res.end("Unauthorized");
      return;
    }

    let parsed: unknown;
    try {
      const raw = await readBody(req);
      parsed = raw.length > 0 ? JSON.parse(raw) : null;
    } catch {
      res.statusCode = 400;
      res.end("Invalid JSON payload");
      return;
    }

    let payload;
    try {
      payload = parseControlPayload(parsed);
    } catch (error) {
      res.statusCode = 400;
      res.end(error instanceof Error ? error.message : "Invalid control payload");
      return;
    }

    const requestId = payload.requestId ?? "req_auto";
    try {
      if (payload.agentIds) {
        for (const agentId of payload.agentIds) {
          const sessionKey = resolveSessionKeyForAgent(agentId, payload.params);
          const actions = buildGatewayActions(payload.command, payload.params, sessionKey);
          await executeGatewayActions(gateway, actions);
        }
      } else if (payload.agentId) {
        const sessionKey = resolveSessionKeyForAgent(payload.agentId, payload.params);
        const actions = buildGatewayActions(payload.command, payload.params, sessionKey);
        await executeGatewayActions(gateway, actions);
      } else {
        throw new ControlValidationError("Missing agentId");
      }

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ requestId, status: "accepted" }));
    } catch (error) {
      const status = error instanceof ControlValidationError ? "rejected" : "error";
      const message = error instanceof Error ? error.message : "Gateway error";
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ requestId, status, error: message }));
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start mock bridge server");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}/api/control`,
  };
}

function createActionCtx() {
  const base = createMockCtx();
  const runMutation = vi.fn(async (_mutation: unknown, args: Record<string, unknown>) => {
    if ("operationIds" in args) {
      return controls.updateOperationStatus._handler(base, args as never);
    }
    if ("outcome" in args) {
      return controls.recordAudit._handler(base, args as never);
    }
    if ("operationId" in args && "requestedBy" in args) {
      return controls.createOperation._handler(base, args as never);
    }
    throw new Error("Unknown mutation args");
  });

  const ctx = {
    ...base,
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_1" }),
    },
    runMutation,
  };

  return { ctx, base };
}

describe("OpenClaw command translation", () => {
  it("normalizes command aliases", () => {
    expect(normalizeCommand("agent.pause")).toBe("pause");
    expect(normalizeCommand("agent.resume")).toBe("resume");
    expect(normalizeCommand("agent.redirect")).toBe("redirect");
    expect(normalizeCommand("agent.kill")).toBe("kill");
    expect(normalizeCommand("agent.restart")).toBe("restart");
    expect(normalizeCommand("agent.priority.override")).toBe("priority");
    expect(normalizeCommand("agent.priority")).toBe("priority");
    expect(normalizeCommand("unknown")).toBeNull();
  });

  it("parses single-agent payloads", () => {
    const payload = parseControlPayload({
      agentId: "agent_alpha",
      command: "agent.pause",
      params: { reason: "maintenance" },
      requestId: "req_1",
    });

    expect(payload.agentId).toBe("agent_alpha");
    expect(payload.command).toBe("pause");
    expect(payload.requestId).toBe("req_1");
  });

  it("parses bulk payloads with agentIds", () => {
    const payload = parseControlPayload({
      agentIds: ["agent_a", "agent_b"],
      command: "agent.pause",
      params: { reason: "bulk test" },
      requestId: "req_bulk",
    });

    expect(payload.agentIds).toEqual(["agent_a", "agent_b"]);
    expect(payload.command).toBe("pause");
  });

  it("parses legacy agents.bulk payloads", () => {
    const payload = parseControlPayload({
      command: "agents.bulk",
      params: {
        command: "agent.kill",
        agentIds: ["agent_x", "agent_y"],
        params: { force: true },
        requestId: "req_bulk_legacy",
      },
    });

    expect(payload.agentIds).toEqual(["agent_x", "agent_y"]);
    expect(payload.command).toBe("kill");
    expect(payload.requestId).toBe("req_bulk_legacy");
  });

  it("resolves session keys with overrides", () => {
    expect(resolveSessionKeyForAgent("alpha", {})).toBe("agent:alpha:main");
    expect(resolveSessionKeyForAgent("beta", { sessionKey: "custom" })).toBe("custom");
  });

  it("builds gateway actions for each command", () => {
    const sessionKey = "agent:alpha:main";

    expect(buildGatewayActions("pause", {}, sessionKey)).toEqual([
      { type: "send", sessionKey, message: "/stop" },
    ]);

    expect(buildGatewayActions("resume", {}, sessionKey)).toEqual([
      { type: "call", method: "cron.wake", params: { text: "Resume work", mode: "now" } },
    ]);

    expect(
      buildGatewayActions("redirect", { taskPayload: { task: "New work" } }, sessionKey)
    ).toEqual([
      { type: "send", sessionKey, message: JSON.stringify({ task: "New work" }) },
    ]);

    expect(buildGatewayActions("kill", {}, sessionKey)).toEqual([
      { type: "send", sessionKey, message: "/stop" },
      { type: "send", sessionKey, message: "/reset" },
    ]);

    expect(buildGatewayActions("restart", {}, sessionKey)).toEqual([
      { type: "send", sessionKey, message: "/new" },
    ]);

    expect(buildGatewayActions("priority", { priority: "high" }, sessionKey)).toEqual([
      { type: "send", sessionKey, message: "/queue priority:high" },
    ]);
  });

  it("rejects missing redirect payload or priority", () => {
    expect(() => buildGatewayActions("redirect", {}, "agent:alpha:main")).toThrow(
      "Missing task payload"
    );
    expect(() => buildGatewayActions("priority", {}, "agent:alpha:main")).toThrow(
      "Missing priority"
    );
  });
});

describe("OpenClaw integration via mock gateway", () => {
  const originalEnv = {
    BRIDGE_CONTROL_URL: process.env.BRIDGE_CONTROL_URL,
    BRIDGE_CONTROL_SECRET: process.env.BRIDGE_CONTROL_SECRET,
    BRIDGE_SECRET: process.env.BRIDGE_SECRET,
  };
  const gateway = createMockGateway();
  let server: http.Server;
  let url: string;

  beforeAll(async () => {
    const started = await createMockBridgeServer(gateway, "secret");
    server = started.server;
    url = started.url;
  });

  afterAll(() => {
    server.close();
    process.env.BRIDGE_CONTROL_URL = originalEnv.BRIDGE_CONTROL_URL;
    process.env.BRIDGE_CONTROL_SECRET = originalEnv.BRIDGE_CONTROL_SECRET;
    process.env.BRIDGE_SECRET = originalEnv.BRIDGE_SECRET;
  });

  beforeEach(() => {
    gateway.reset();
    process.env.BRIDGE_CONTROL_URL = url;
    process.env.BRIDGE_CONTROL_SECRET = "secret";
  });

  it("runs pause/resume cycle and records audits", async () => {
    const { ctx, base } = createActionCtx();

    const pause = await controls.dispatch._handler(ctx as never, {
      agentId: "agent_1",
      command: "agent.pause",
      requestId: "req_pause",
    });
    const resume = await controls.dispatch._handler(ctx as never, {
      agentId: "agent_1",
      command: "agent.resume",
      requestId: "req_resume",
    });

    expect(pause.bridgeStatus).toBe("accepted");
    expect(resume.bridgeStatus).toBe("accepted");

    expect(gateway.calls).toEqual([
      { type: "send", sessionKey: "agent:agent_1:main", message: "/stop" },
      {
        type: "call",
        method: "cron.wake",
        params: { text: "Resume work", mode: "now" },
      },
    ]);

    const audits = await base.db.query("agentControlAudits").collect();
    expect(audits).toHaveLength(2);
    expect(audits.map((audit) => audit.outcome)).toEqual(["accepted", "accepted"]);
  });

  it("kills and restarts an agent", async () => {
    const { ctx } = createActionCtx();

    await controls.dispatch._handler(ctx as never, {
      agentId: "agent_2",
      command: "agent.kill",
      requestId: "req_kill",
    });
    await controls.dispatch._handler(ctx as never, {
      agentId: "agent_2",
      command: "agent.restart",
      requestId: "req_restart",
    });

    expect(gateway.calls).toEqual([
      { type: "send", sessionKey: "agent:agent_2:main", message: "/stop" },
      { type: "send", sessionKey: "agent:agent_2:main", message: "/reset" },
      { type: "send", sessionKey: "agent:agent_2:main", message: "/new" },
    ]);
  });

  it("redirects to a new task and sets priority", async () => {
    const { ctx } = createActionCtx();

    await controls.dispatch._handler(ctx as never, {
      agentId: "agent_3",
      command: "agent.redirect",
      params: { taskPayload: { task: "Investigate anomaly" } },
      requestId: "req_redirect",
    });
    await controls.dispatch._handler(ctx as never, {
      agentId: "agent_3",
      command: "agent.priority.override",
      params: { priority: "critical" },
      requestId: "req_priority",
    });

    expect(gateway.calls).toEqual([
      {
        type: "send",
        sessionKey: "agent:agent_3:main",
        message: JSON.stringify({ task: "Investigate anomaly" }),
      },
      {
        type: "send",
        sessionKey: "agent:agent_3:main",
        message: "/queue priority:critical",
      },
    ]);
  });

  it("handles bulk pause/resume operations", async () => {
    const { ctx, base } = createActionCtx();

    const pause = await controls.bulkDispatch._handler(ctx as never, {
      agentIds: ["agent_a", "agent_b"],
      command: "agent.pause",
      requestId: "req_bulk_pause",
    });

    expect(pause.ok).toBe(true);
    expect(pause.operations).toHaveLength(2);
    expect(gateway.calls).toEqual([
      { type: "send", sessionKey: "agent:agent_a:main", message: "/stop" },
      { type: "send", sessionKey: "agent:agent_b:main", message: "/stop" },
    ]);

    gateway.reset();

    const resume = await controls.bulkDispatch._handler(ctx as never, {
      agentIds: ["agent_a", "agent_b"],
      command: "agent.resume",
      requestId: "req_bulk_resume",
    });

    expect(resume.ok).toBe(true);
    expect(resume.operations).toHaveLength(2);
    expect(gateway.calls).toEqual([
      { type: "call", method: "cron.wake", params: { text: "Resume work", mode: "now" } },
      { type: "call", method: "cron.wake", params: { text: "Resume work", mode: "now" } },
    ]);

    const audits = await base.db.query("agentControlAudits").collect();
    expect(audits).toHaveLength(4);
  });

  it("records errors when gateway is down", async () => {
    const { ctx, base } = createActionCtx();
    gateway.failWith(new Error("Gateway down"));

    const result = await controls.dispatch._handler(ctx as never, {
      agentId: "agent_4",
      command: "agent.pause",
      requestId: "req_gateway_down",
    });

    expect(result.ok).toBe(false);
    expect(result.bridgeStatus).toBe("error");
    expect(result.error).toBe("Gateway down");

    const audits = await base.db.query("agentControlAudits").collect();
    expect(audits[0]?.outcome).toBe("error");
  });

  it("returns auth failure when bridge secret mismatches", async () => {
    const { ctx } = createActionCtx();
    process.env.BRIDGE_CONTROL_SECRET = "wrong-secret";

    const result = await controls.dispatch._handler(ctx as never, {
      agentId: "agent_5",
      command: "agent.pause",
      requestId: "req_auth_fail",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Bridge responded with 401");
  });
});

describe("OpenClaw end-to-end (real gateway)", () => {
  const shouldRun =
    process.env.OPENCLAW_E2E === "true" &&
    process.env.OPENCLAW_BRIDGE_URL &&
    process.env.OPENCLAW_BRIDGE_SECRET;

  const suite = shouldRun ? describe : describe.skip;

  suite("bridge-connected OpenClaw", () => {
    it("dispatches a pause command through the live bridge", async () => {
      const { ctx } = createActionCtx();
      const originalUrl = process.env.BRIDGE_CONTROL_URL;
      const originalSecret = process.env.BRIDGE_CONTROL_SECRET;

      process.env.BRIDGE_CONTROL_URL = process.env.OPENCLAW_BRIDGE_URL;
      process.env.BRIDGE_CONTROL_SECRET = process.env.OPENCLAW_BRIDGE_SECRET;

      const agentId = process.env.OPENCLAW_E2E_AGENT_ID ?? "main";
      const result = await controls.dispatch._handler(ctx as never, {
        agentId,
        command: "agent.pause",
        requestId: `req_e2e_pause_${Date.now()}`,
      });

      process.env.BRIDGE_CONTROL_URL = originalUrl;
      process.env.BRIDGE_CONTROL_SECRET = originalSecret;

      expect(result.bridgeStatus).toBe("accepted");
    });
  });
});
