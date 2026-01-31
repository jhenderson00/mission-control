import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("handles arrays and falsy values", () => {
    expect(cn(["a", false, "b"], undefined, null, "c")).toBe("a b c");
  });
});
