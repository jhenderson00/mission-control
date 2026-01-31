import { describe, expect, it } from "vitest";
import { createMockCtx } from "@/test/convex-test-utils";

describe("convex test utils", () => {
  it("filters with eq in withIndex", async () => {
    const ctx = createMockCtx();
    ctx.db.seed("tasks", [
      { status: "queued" },
      { status: "active" },
      { status: "active" },
    ]);

    const active = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    expect(active).toHaveLength(2);
  });

  it("filters with gte on numeric fields", async () => {
    const ctx = createMockCtx();
    const now = Date.now();

    ctx.db.seed("events", [
      { createdAt: now - 1000 },
      { createdAt: now - 200 },
      {},
    ]);

    const recent = await ctx.db
      .query("events")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", now - 500))
      .collect();

    expect(recent).toHaveLength(1);
  });

  it("filters with gte on string fields", async () => {
    const ctx = createMockCtx();
    ctx.db.seed("agents", [
      { name: "Alpha" },
      { name: "Gamma" },
      { name: "Zeta" },
    ]);

    const results = await ctx.db
      .query("agents")
      .withIndex("by_name", (q) => q.gte("name", "Gamma"))
      .collect();

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("Gamma");
  });

  it("supports array equality in withIndex", async () => {
    const ctx = createMockCtx();
    ctx.db.seed("agentControlOperations", [
      { agentIds: ["agent-1"], status: "queued" },
      { agentIds: ["agent-2"], status: "queued" },
    ]);

    const results = await ctx.db
      .query("agentControlOperations")
      .withIndex("by_agent", (q) => q.eq("agentIds", ["agent-1"]))
      .collect();

    expect(results).toHaveLength(1);
  });

  it("filters with field expressions in filter", async () => {
    const ctx = createMockCtx();
    ctx.db.seed("agentControlOperations", [
      { agentIds: ["agent-1"], status: "queued", params: { reason: "test" } },
      { agentIds: ["agent-1"], status: "failed", params: { reason: "bad" } },
      { agentIds: ["agent-2"], status: "sent", params: { reason: "test" } },
    ]);

    const results = await ctx.db
      .query("agentControlOperations")
      .filter((q) =>
        q.and(
          q.eq(q.field("agentIds"), ["agent-1"]),
          q.or(
            q.eq(q.field("status"), "queued"),
            q.eq(q.field("status"), "sent")
          ),
          q.eq(q.field("params.reason"), "test")
        )
      )
      .collect();

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("queued");
  });

  it("matches object equality in withIndex", async () => {
    const ctx = createMockCtx();
    ctx.db.seed("agentControlOperations", [
      { params: { reason: "alpha", meta: { level: 1 } } },
      { params: { reason: "beta", meta: { level: 2 } } },
    ]);

    const matches = await ctx.db
      .query("agentControlOperations")
      .withIndex("by_params", (q) => q.eq("params", { reason: "alpha", meta: { level: 1 } }))
      .collect();

    const misses = await ctx.db
      .query("agentControlOperations")
      .withIndex("by_params", (q) => q.eq("params", { reason: "gamma" }))
      .collect();

    expect(matches).toHaveLength(1);
    expect(misses).toHaveLength(0);
  });
});
