import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import GraphPage from "@/app/(dashboard)/graph/page";

describe("GraphPage", () => {
  it("renders graph view", () => {
    render(<GraphPage />);
    expect(screen.getByText("Context Graph")).toBeInTheDocument();
    expect(screen.getByText("Graph View")).toBeInTheDocument();
  });
});
