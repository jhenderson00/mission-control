import { describe, expect, it } from "vitest";
import * as activity from "@/components/activity";

describe("activity exports", () => {
  it("exposes activity components", () => {
    expect(activity.ActivityFeed).toBeDefined();
    expect(activity.ActivityItem).toBeDefined();
    expect(activity.ActivityFilters).toBeDefined();
  });
});
