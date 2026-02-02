// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { HelloOkFrame } from "./types";
import { buildSubscriptionPlan } from "./subscriptions";

describe("buildSubscriptionPlan", () => {
  it("merges base events with advertised events", () => {
    const hello: HelloOkFrame = {
      type: "hello-ok",
      features: {
        events: ["presence", "diagnostic", "chat", ""],
      },
    };

    const plan = buildSubscriptionPlan(hello, [
      "agent",
      "chat",
      "health",
    ]);

    expect(plan.events).toEqual([
      "agent",
      "chat",
      "health",
      "presence",
      "diagnostic",
    ]);
    expect(plan.includesPresence).toBe(true);
  });

  it("falls back to base events when no features are available", () => {
    const plan = buildSubscriptionPlan(null, ["agent", "chat"]);

    expect(plan.events).toEqual(["agent", "chat"]);
    expect(plan.includesPresence).toBe(false);
  });
});
