import React from "react";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
}

if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

const mockUsePathname = vi.fn(() => "/");
const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  notFound: () => mockNotFound(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...props }, children),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    agents: {
      statusCounts: "agents.statusCounts",
      presenceCounts: "agents.presenceCounts",
      listWithTasks: "agents.listWithTasks",
      get: "agents.get",
      listStatus: "agents.listStatus",
    },
    tasks: {
      statusCounts: "tasks.statusCounts",
      listWithAgents: "tasks.listWithAgents",
      get: "tasks.get",
    },
    decisions: {
      pendingCount: "decisions.pendingCount",
      listRecent: "decisions.listRecent",
      listByAgent: "decisions.listByAgent",
    },
    events: {
      countsByType: "events.countsByType",
      listRecent: "events.listRecent",
      listByAgent: "events.listByAgent",
    },
    conversations: {
      listBySession: "conversations.listBySession",
    },
    controls: {
      dispatch: "controls.dispatch",
      bulkDispatch: "controls.bulkDispatch",
    },
  },
}));

(globalThis as typeof globalThis & { __setMockPathname?: (path: string) => void }).__setMockPathname = (
  path: string
) => {
  mockUsePathname.mockReturnValue(path);
};
