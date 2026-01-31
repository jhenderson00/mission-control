import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TasksPage from "@/app/(dashboard)/tasks/page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

describe("TasksPage", () => {
  it("renders task queue", () => {
    render(<TasksPage />);
    expect(screen.getByText("Task Queue")).toBeInTheDocument();
    expect(screen.getByText("Mission Pipeline")).toBeInTheDocument();
  });
});
