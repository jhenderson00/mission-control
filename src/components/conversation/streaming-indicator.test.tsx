import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StreamingIndicator } from "@/components/conversation/streaming-indicator";

describe("StreamingIndicator", () => {
  it("renders default label", () => {
    render(<StreamingIndicator />);
    expect(screen.getByText("Streaming")).toBeInTheDocument();
  });

  it("supports hiding the label", () => {
    render(<StreamingIndicator label="" />);
    expect(screen.queryByText("Streaming")).not.toBeInTheDocument();
  });
});
