import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TasksPage from "@/app/(dashboard)/tasks/page";

describe("TasksPage", () => {
  it("renders task queue", () => {
    render(<TasksPage />);
    expect(screen.getByText("Task Queue")).toBeInTheDocument();
    expect(screen.getByText("Mission Pipeline")).toBeInTheDocument();
  });
});
