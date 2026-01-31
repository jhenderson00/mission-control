import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AgentDetailPage from "@/app/(dashboard)/agents/[id]/page";

describe("AgentDetailPage", () => {
  it("renders details for a known agent", () => {
    render(<AgentDetailPage params={{ id: "agent_1" }} />);
    expect(screen.getByText("Agent Overview")).toBeInTheDocument();
    expect(screen.getByText("Decision Log")).toBeInTheDocument();
  });

  it("throws notFound for unknown agent", () => {
    expect(() => render(<AgentDetailPage params={{ id: "missing" }} />)).toThrow(
      "NEXT_NOT_FOUND"
    );
  });
});
