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
});
