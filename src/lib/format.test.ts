import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { formatDuration } from "@/lib/format";

describe("formatDuration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns fallback when startedAt is missing", () => {
    expect(formatDuration(undefined, "Idle")).toBe("Idle");
    expect(formatDuration()).toBe("");
  });

  it("formats minutes and hours", () => {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    expect(formatDuration(tenMinutesAgo, "Idle")).toBe("10m active");

    const ninetyMinutesAgo = Date.now() - 90 * 60 * 1000;
    expect(formatDuration(ninetyMinutesAgo, "Idle")).toBe("1h 30m active");
  });
});
