import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as controlOperations from "./controlOperations";
import { createMockCtx } from "@/test/convex-test-utils";

describe("controlOperations queries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists active operations for an agent", async () => {
    const ctx = createMockCtx();
    ctx.db.seed("agentControlOperations", [
      {
        operationId: "op-1",
        agentIds: ["agent-1"],
        command: "pause",
        params: {},
        status: "queued",
        requestedBy: "user-1",
        requestedAt: Date.now(),
      },
      {
        operationId: "op-2",
        agentIds: ["agent-1"],
        command: "resume",
        params: {},
        status: "failed",
        requestedBy: "user-1",
        requestedAt: Date.now(),
      },
      {
        operationId: "op-3",
        agentIds: ["agent-2"],
        command: "pause",
        params: {},
        status: "sent",
        requestedBy: "user-2",
        requestedAt: Date.now(),
      },
      {
        operationId: "op-4",
        agentIds: ["agent-1"],
        command: "redirect",
        params: {},
        status: "acked",
        requestedBy: "user-1",
        requestedAt: Date.now(),
      },
      {
        operationId: "op-5",
        agentIds: ["agent-1"],
        command: "restart",
        params: {},
        status: "timed-out",
        requestedBy: "user-1",
        requestedAt: Date.now(),
      },
    ]);

    const active = await controlOperations.activeByAgent._handler(ctx, {
      agentId: "agent-1",
    });

    expect(active).toHaveLength(2);
    expect(active.map((entry) => entry.operationId).sort()).toEqual(["op-1", "op-4"]);
  });

  it("lists recent operations by operator", async () => {
    const ctx = createMockCtx();
    ctx.db.seed("agentControlOperations", [
      {
        operationId: "op-10",
        agentIds: ["agent-1"],
        command: "pause",
        params: {},
        status: "queued",
        requestedBy: "user-1",
        requestedAt: Date.now(),
      },
    ]);

    vi.advanceTimersByTime(1000);
    ctx.db.seed("agentControlOperations", [
      {
        operationId: "op-11",
        agentIds: ["agent-2"],
        command: "resume",
        params: {},
        status: "sent",
        requestedBy: "user-1",
        requestedAt: Date.now(),
      },
      {
        operationId: "op-12",
        agentIds: ["agent-3"],
        command: "restart",
        params: {},
        status: "queued",
        requestedBy: "user-2",
        requestedAt: Date.now(),
      },
    ]);

    const recent = await controlOperations.recentByOperator._handler(ctx, {
      requestedBy: "user-1",
      limit: 2,
    });

    expect(recent).toHaveLength(2);
    expect(recent.map((entry) => entry.operationId)).toEqual(["op-11", "op-10"]);
  });
});
