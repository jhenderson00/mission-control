import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { PageHeader } from "@/components/dashboard/page-header";

vi.mock("convex/react", () => ({
  useConvexConnectionState: () => ({
    isWebSocketConnected: true,
    hasEverConnected: true,
  }),
}));

describe("PageHeader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders title, description, and badge", () => {
    const { getByText } = render(
      <PageHeader
        title="Mission"
        description="Status update"
        badge="Live"
      />
    );

    expect(getByText("Mission")).toBeInTheDocument();
    expect(getByText("Status update")).toBeInTheDocument();
    expect(getByText("Live")).toBeInTheDocument();
  });

  it("renders live clock output", () => {
    const { container } = render(
      <PageHeader title="Mission" description="Status update" />
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const clock = container.querySelector(".tabular-nums");
    expect(clock).toBeInTheDocument();
    expect(clock?.textContent?.length).toBeGreaterThan(0);
  });
});
