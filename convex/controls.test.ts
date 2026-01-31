import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as controls from "./controls";
import { createMockCtx } from "@/test/convex-test-utils";

const originalEnv = {
  BRIDGE_CONTROL_URL: process.env.BRIDGE_CONTROL_URL,
  BRIDGE_CONTROL_SECRET: process.env.BRIDGE_CONTROL_SECRET,
  BRIDGE_SECRET: process.env.BRIDGE_SECRET,
};

const originalFetch = globalThis.fetch;

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

  return { ctx, base, runMutation };
}

function mockBridgeResponse(payload: Record<string, unknown>, ok = true) {
  const fetchMock = vi.mocked(globalThis.fetch);
  fetchMock.mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  } as Response);
}

describe("controls", () => {
  beforeEach(() => {
    process.env.BRIDGE_CONTROL_URL = "https://bridge.test";
    process.env.BRIDGE_CONTROL_SECRET = "secret";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env.BRIDGE_CONTROL_URL = originalEnv.BRIDGE_CONTROL_URL;
    process.env.BRIDGE_CONTROL_SECRET = originalEnv.BRIDGE_CONTROL_SECRET;
    process.env.BRIDGE_SECRET = originalEnv.BRIDGE_SECRET;
    const fetchMock = globalThis.fetch as unknown as { mockReset?: () => void };
    fetchMock?.mockReset?.();
    globalThis.fetch = originalFetch;
  });

  it("creates and reuses operations", async () => {
    const ctx = createMockCtx();
    const first = await controls.createOperation._handler(ctx, {
      operationId: "op_1",
      requestId: "req_1",
      agentId: "agent_1",
      command: "agent.pause",
      params: { reason: "test" },
      status: "queued",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });

    const second = await controls.createOperation._handler(ctx, {
      operationId: "op_1",
      requestId: "req_1",
      agentId: "agent_1",
      command: "agent.pause",
      params: { reason: "test" },
      status: "queued",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });

    expect(first.existing).toBe(false);
    expect(second.existing).toBe(true);
  });

  it("updates operation status with optional fields", async () => {
    const ctx = createMockCtx();
    const created = await controls.createOperation._handler(ctx, {
      operationId: "op_2",
      requestId: "req_2",
      agentId: "agent_2",
      command: "agent.resume",
      params: {},
      status: "queued",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });

    await controls.updateOperationStatus._handler(ctx, {
      operationIds: [created.id],
      status: "acked",
      ackedAt: 123,
      completedAt: 456,
      error: "none",
    });

    const stored = await ctx.db.get(created.id);
    expect(stored?.status).toBe("acked");
    expect(stored?.ackedAt).toBe(123);
    expect(stored?.completedAt).toBe(456);
    expect(stored?.error).toBe("none");
  });

  it("records audits", async () => {
    const ctx = createMockCtx();
    const auditId = await controls.recordAudit._handler(ctx, {
      operationId: "op_3",
      requestId: "req_3",
      agentId: "agent_3",
      command: "agent.kill",
      params: {},
      outcome: "accepted",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });

    const stored = await ctx.db.get(auditId);
    expect(stored?.operationId).toBe("op_3");
  });

  it("dispatches commands successfully", async () => {
    const { ctx } = createActionCtx();
    mockBridgeResponse({ requestId: "req_4", status: "accepted" });

    const result = await controls.dispatch._handler(ctx as never, {
      agentId: "agent_1",
      command: "agent.pause",
      params: { reason: "break" },
      requestId: "req_4",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("acked");
    expect(result.bridgeStatus).toBe("accepted");
  });

  it("handles rejected acknowledgments", async () => {
    const { ctx } = createActionCtx();
    mockBridgeResponse({ requestId: "req_reject", status: "rejected", error: "nope" });

    const result = await controls.dispatch._handler(ctx as never, {
      agentId: "agent_1",
      command: "agent.restart",
      requestId: "req_reject",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.bridgeStatus).toBe("rejected");
  });

  it("handles error acknowledgments", async () => {
    const { ctx } = createActionCtx();
    mockBridgeResponse({ requestId: "req_error_ack", status: "error", error: "timeout" });

    const result = await controls.dispatch._handler(ctx as never, {
      agentId: "agent_1",
      command: "agent.pause",
      requestId: "req_error_ack",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.bridgeStatus).toBe("error");
  });

  it("throws on invalid redirect payload", async () => {
    const { ctx } = createActionCtx();
    await expect(
      controls.dispatch._handler(ctx as never, {
        agentId: "agent_1",
        command: "agent.redirect",
        params: {},
        requestId: "req_invalid",
      })
    ).rejects.toThrow("redirect requires taskId or taskPayload");
  });

  it("returns error when bridge url is missing", async () => {
    const { ctx } = createActionCtx();
    process.env.BRIDGE_CONTROL_URL = "";
    mockBridgeResponse({ requestId: "req_missing", status: "accepted" });

    const result = await controls.dispatch._handler(ctx as never, {
      agentId: "agent_1",
      command: "agent.pause",
      requestId: "req_missing",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Missing BRIDGE_CONTROL_URL");
  });

  it("returns error when bridge secret is missing", async () => {
    const { ctx } = createActionCtx();
    process.env.BRIDGE_CONTROL_SECRET = "";
    process.env.BRIDGE_SECRET = "";
    mockBridgeResponse({ requestId: "req_missing_secret", status: "accepted" });

    const result = await controls.dispatch._handler(ctx as never, {
      agentId: "agent_1",
      command: "agent.pause",
      requestId: "req_missing_secret",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Missing BRIDGE_CONTROL_SECRET");
  });

  it("handles invalid bridge responses", async () => {
    const { ctx } = createActionCtx();
    mockBridgeResponse({ foo: "bar" });

    const result = await controls.dispatch._handler(ctx as never, {
      agentId: "agent_1",
      command: "agent.pause",
      requestId: "req_invalid_bridge",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid bridge response");
  });

  it("returns early for existing operations", async () => {
    const { ctx, base } = createActionCtx();
    await controls.createOperation._handler(base, {
      operationId: "req_5",
      requestId: "req_5",
      agentId: "agent_1",
      command: "agent.priority.override",
      params: { priority: "high", durationMs: 1000 },
      status: "acked",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });

    const fetchMock = vi.mocked(globalThis.fetch);
    const result = await controls.dispatch._handler(ctx as never, {
      agentId: "agent_1",
      command: "agent.priority.override",
      params: { priority: "high", durationMs: 1000 },
      requestId: "req_5",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("acked");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles bridge errors for dispatch", async () => {
    const { ctx } = createActionCtx();
    mockBridgeResponse({ requestId: "req_6", status: "accepted" }, false);

    const result = await controls.dispatch._handler(ctx as never, {
      agentId: "agent_1",
      command: "agent.redirect",
      params: { taskId: "task_1" },
      requestId: "req_6",
    });

    expect(result.ok).toBe(false);
    expect(result.bridgeStatus).toBe("error");
    expect(result.status).toBe("failed");
  });

  it("bulk dispatch returns when all operations exist", async () => {
    const { ctx, base } = createActionCtx();
    await controls.createOperation._handler(base, {
      operationId: "req_7:agent_1",
      requestId: "req_7",
      bulkId: "req_7",
      agentId: "agent_1",
      command: "agent.kill",
      params: {},
      status: "acked",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });
    await controls.createOperation._handler(base, {
      operationId: "req_7:agent_2",
      requestId: "req_7",
      bulkId: "req_7",
      agentId: "agent_2",
      command: "agent.kill",
      params: {},
      status: "acked",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });

    const fetchMock = vi.mocked(globalThis.fetch);
    const result = await controls.bulkDispatch._handler(ctx as never, {
      agentIds: ["agent_1", "agent_2"],
      command: "agent.kill",
      requestId: "req_7",
    });

    expect(result.ok).toBe(true);
    expect(result.operations).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bulk dispatch accepts new operations", async () => {
    const { ctx } = createActionCtx();
    mockBridgeResponse({ requestId: "req_8", status: "accepted" });

    const result = await controls.bulkDispatch._handler(ctx as never, {
      agentIds: ["agent_1", "agent_2"],
      command: "agent.resume",
      requestId: "req_8",
    });

    expect(result.ok).toBe(true);
    expect(result.bridgeStatus).toBe("accepted");
    expect(result.operations.every((op) => op.status === "acked")).toBe(true);
  });

  it("bulk dispatch handles rejected acknowledgments", async () => {
    const { ctx } = createActionCtx();
    mockBridgeResponse({ requestId: "req_11", status: "rejected", error: "nope" });

    const result = await controls.bulkDispatch._handler(ctx as never, {
      agentIds: ["agent_1", "agent_2"],
      command: "agent.pause",
      requestId: "req_11",
    });

    expect(result.ok).toBe(false);
    expect(result.bridgeStatus).toBe("rejected");
    expect(result.operations.every((op) => op.status === "failed")).toBe(true);
  });

  it("bulk dispatch handles error acknowledgments", async () => {
    const { ctx } = createActionCtx();
    mockBridgeResponse({ requestId: "req_12", status: "error", error: "timeout" });

    const result = await controls.bulkDispatch._handler(ctx as never, {
      agentIds: ["agent_1"],
      command: "agent.pause",
      requestId: "req_12",
    });

    expect(result.ok).toBe(false);
    expect(result.bridgeStatus).toBe("error");
    expect(result.operations[0].status).toBe("failed");
  });

  it("bulk dispatch handles bridge failures", async () => {
    const { ctx } = createActionCtx();
    mockBridgeResponse({ requestId: "req_9", status: "accepted" }, false);

    const result = await controls.bulkDispatch._handler(ctx as never, {
      agentIds: ["agent_1"],
      command: "agent.pause",
      params: { reason: "stop" },
      requestId: "req_9",
    });

    expect(result.ok).toBe(false);
    expect(result.bridgeStatus).toBe("error");
    expect(result.operations[0].status).toBe("failed");
  });

  it("throws on invalid dispatch input", async () => {
    const { ctx } = createActionCtx();
    await expect(
      controls.dispatch._handler(ctx as never, {
        agentId: "",
        command: "agent.pause",
      })
    ).rejects.toThrow();
  });

  it("throws on unauthorized dispatch", async () => {
    const ctx = {
      auth: { getUserIdentity: vi.fn().mockResolvedValue(null) },
      runMutation: vi.fn(),
    };

    await expect(
      controls.dispatch._handler(ctx as never, {
        agentId: "agent_1",
        command: "agent.pause",
      })
    ).rejects.toThrow("Unauthorized");
  });

  it("throws on invalid bulk dispatch input", async () => {
    const { ctx } = createActionCtx();
    await expect(
      controls.bulkDispatch._handler(ctx as never, {
        agentIds: [],
        command: "agent.pause",
      })
    ).rejects.toThrow();
  });

  it("throws on unauthorized bulk dispatch", async () => {
    const ctx = {
      auth: { getUserIdentity: vi.fn().mockResolvedValue(null) },
      runMutation: vi.fn(),
    };

    await expect(
      controls.bulkDispatch._handler(ctx as never, {
        agentIds: ["agent_1"],
        command: "agent.pause",
      })
    ).rejects.toThrow("Unauthorized");
  });

  it("lists active operations by agent", async () => {
    const ctx = createMockCtx();
    await ctx.db.insert("agentControlOperations", {
      operationId: "op_active_1",
      requestId: "req_a1",
      agentId: "agent_1",
      command: "agent.pause",
      status: "queued",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });
    await ctx.db.insert("agentControlOperations", {
      operationId: "op_active_2",
      requestId: "req_a2",
      agentId: "agent_1",
      command: "agent.pause",
      status: "sent",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });
    await ctx.db.insert("agentControlOperations", {
      operationId: "op_active_3",
      requestId: "req_a3",
      agentId: "agent_1",
      command: "agent.pause",
      status: "acked",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });
    await ctx.db.insert("agentControlOperations", {
      operationId: "op_failed",
      requestId: "req_a4",
      agentId: "agent_1",
      command: "agent.pause",
      status: "failed",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });

    const result = await controls.listActiveByAgent._handler(ctx, {
      agentId: "agent_1",
    });

    const statuses = result.map((entry) => entry.status);
    expect(statuses).toContain("queued");
    expect(statuses).toContain("sent");
    expect(statuses).toContain("acked");
    expect(statuses).not.toContain("failed");
  });

  it("lists recent operations by operator", async () => {
    const ctx = createMockCtx();
    await ctx.db.insert("agentControlOperations", {
      operationId: "op_user_1",
      requestId: "req_user_1",
      agentId: "agent_1",
      command: "agent.pause",
      status: "queued",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });
    await ctx.db.insert("agentControlOperations", {
      operationId: "op_user_2",
      requestId: "req_user_2",
      agentId: "agent_2",
      command: "agent.pause",
      status: "queued",
      requestedBy: "user_2",
      requestedAt: Date.now(),
    });

    const result = await controls.listRecentByOperator._handler(ctx, {
      requestedBy: "user_1",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.operationId).toBe("op_user_1");
  });

  it("lists operations by bulk id", async () => {
    const ctx = createMockCtx();
    await ctx.db.insert("agentControlOperations", {
      operationId: "bulk_op_1",
      requestId: "bulk_req",
      bulkId: "bulk_req",
      agentId: "agent_1",
      command: "agent.pause",
      status: "queued",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });
    await ctx.db.insert("agentControlOperations", {
      operationId: "bulk_op_2",
      requestId: "bulk_req",
      bulkId: "bulk_req",
      agentId: "agent_2",
      command: "agent.pause",
      status: "queued",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });

    const result = await controls.listByBulkId._handler(ctx, {
      bulkId: "bulk_req",
    });

    expect(result).toHaveLength(2);
  });

  it("lists audits by agent", async () => {
    const ctx = createMockCtx();
    await ctx.db.insert("agentControlAudits", {
      operationId: "audit_op_1",
      requestId: "audit_req_1",
      agentId: "agent_1",
      command: "agent.pause",
      outcome: "accepted",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });

    const result = await controls.listAuditsByAgent._handler(ctx, {
      agentId: "agent_1",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.operationId).toBe("audit_op_1");
  });

  it("filters recent audits", async () => {
    const ctx = createMockCtx();
    await ctx.db.insert("agentControlAudits", {
      operationId: "audit_op_2",
      requestId: "audit_req_2",
      agentId: "agent_1",
      command: "agent.pause",
      outcome: "accepted",
      requestedBy: "user_1",
      requestedAt: Date.now(),
    });
    await ctx.db.insert("agentControlAudits", {
      operationId: "audit_op_3",
      requestId: "audit_req_3",
      agentId: "agent_2",
      command: "agent.pause",
      outcome: "rejected",
      requestedBy: "user_2",
      requestedAt: Date.now(),
    });

    const result = await controls.listAuditsRecent._handler(ctx, {
      outcome: "rejected",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.operationId).toBe("audit_op_3");
  });
});
