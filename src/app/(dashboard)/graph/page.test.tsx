import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GraphPage from "@/app/(dashboard)/graph/page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

describe("GraphPage", () => {
  it("renders graph view", () => {
    render(<GraphPage />);
    expect(screen.getByText("Context Graph")).toBeInTheDocument();
    expect(screen.getByText("Graph View")).toBeInTheDocument();
  });
});
