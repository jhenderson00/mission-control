import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as reports from "./reports";
import { createMockCtx } from "@/test/convex-test-utils";

describe("reports.dailyStandup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds a daily standup markdown report", async () => {
    const ctx = createMockCtx();

    const agentA = await ctx.db.insert("agents", {
      name: "Agent A",
      status: "active",
      type: "executor",
      model: "m1",
      host: "local",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const agentB = await ctx.db.insert("agents", {
      name: "Agent B",
      status: "active",
      type: "planner",
      model: "m2",
      host: "local",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const agentC = await ctx.db.insert("agents", {
      name: "Agent C",
      status: "blocked",
      type: "critic",
      model: "m3",
      host: "local",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const dayStart = Date.parse("2026-02-01T00:00:00.000Z");
    const dayEnd = Date.parse("2026-02-02T00:00:00.000Z");

    await ctx.db.insert("tasks", {
      title: "Ship docs",
      status: "completed",
      requester: "system",
      priority: "high",
      assignedAgentIds: [agentA],
      completedAt: dayStart + 2 * 60 * 60 * 1000,
      createdAt: dayStart - 3 * 60 * 60 * 1000,
      updatedAt: dayStart + 2 * 60 * 60 * 1000,
    });
    await ctx.db.insert("tasks", {
      title: "Old completed task",
      status: "completed",
      requester: "system",
      priority: "low",
      assignedAgentIds: [agentA],
      completedAt: dayStart - 6 * 60 * 60 * 1000,
      createdAt: dayStart - 12 * 60 * 60 * 1000,
      updatedAt: dayStart - 6 * 60 * 60 * 1000,
    });
    await ctx.db.insert("tasks", {
      title: "Active mission",
      status: "active",
      requester: "system",
      priority: "medium",
      assignedAgentIds: [agentB],
      startedAt: dayStart - 4 * 60 * 60 * 1000,
      createdAt: dayStart - 4 * 60 * 60 * 1000,
      updatedAt: dayStart + 1 * 60 * 60 * 1000,
    });
    await ctx.db.insert("tasks", {
      title: "Blocked mission",
      status: "blocked",
      requester: "system",
      priority: "high",
      assignedAgentIds: [agentC],
      blockedReason: "Waiting for approval",
      createdAt: dayStart - 5 * 60 * 60 * 1000,
      updatedAt: dayStart + 30 * 60 * 1000,
    });
    await ctx.db.insert("tasks", {
      title: "Unassigned completion",
      status: "completed",
      requester: "system",
      priority: "low",
      assignedAgentIds: [],
      completedAt: dayStart + 3 * 60 * 60 * 1000,
      createdAt: dayStart - 2 * 60 * 60 * 1000,
      updatedAt: dayStart + 3 * 60 * 60 * 1000,
    });

    await ctx.db.insert("decisions", {
      agentId: agentA,
      decision: "Escalate telemetry gap",
      reasoning: "Missing infra signals",
      outcome: "pending",
      createdAt: dayStart + 4 * 60 * 60 * 1000,
    });
    await ctx.db.insert("decisions", {
      agentId: agentB,
      decision: "Approve deployment window",
      reasoning: "All checks passed",
      outcome: "accepted",
      createdAt: dayStart + 1 * 60 * 60 * 1000,
      decidedAt: dayStart + 5 * 60 * 60 * 1000,
    });
    await ctx.db.insert("decisions", {
      agentId: agentB,
      decision: "Reject late feature",
      reasoning: "Scope risk",
      outcome: "rejected",
      createdAt: dayStart - 10 * 60 * 60 * 1000,
      decidedAt: dayStart - 2 * 60 * 60 * 1000,
    });

    const report = await reports.dailyStandup._handler(ctx, {
      date: "2026-02-01",
      timezoneOffsetMinutes: 0,
    });

    expect(report.rangeStart).toBe(dayStart);
    expect(report.rangeEnd).toBe(dayEnd);
    expect(report.displayDate).toBe("Feb 1, 2026");

    const markdown = report.markdown;
    expect(markdown).toContain("📊 DAILY STANDUP — Feb 1, 2026");
    expect(markdown).toContain("• Agent A: Ship docs");
    expect(markdown).toContain("• Unassigned: Unassigned completion");
    expect(markdown).toContain("• Agent B: Active mission");
    expect(markdown).toContain("• Agent C: Blocked mission — Waiting for approval");
    expect(markdown).toContain("• Agent A: Escalate telemetry gap");
    expect(markdown).toContain("• Agent B: Approve deployment window (accepted)");
    expect(markdown).not.toContain("Old completed task");
    expect(markdown).not.toContain("Reject late feature");
  });
});
