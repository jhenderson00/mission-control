import { describe, expect, it } from "vitest";
import schema from "./schema";

describe("schema", () => {
  it("exports a schema definition", () => {
    expect(schema).toBeDefined();
  });
});
