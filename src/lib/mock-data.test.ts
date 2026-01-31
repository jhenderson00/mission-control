import { describe, expect, it } from "vitest";
import { allMockAgents, mockAgents } from "@/lib/mock-data";

describe("mock data", () => {
  it("includes base agents", () => {
    expect(mockAgents.length).toBeGreaterThan(0);
  });

  it("extends agents list", () => {
    expect(allMockAgents.length).toBeGreaterThan(mockAgents.length);
  });
});
