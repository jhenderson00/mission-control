import { describe, expect, it } from "vitest";
import http from "./http";

describe("http router", () => {
  it("exports a router", () => {
    expect(http).toBeDefined();
  });
});
