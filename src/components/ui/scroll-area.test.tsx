import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScrollArea } from "@/components/ui/scroll-area";

describe("ScrollArea", () => {
  it("renders children and scroll area slots", () => {
    render(
      <ScrollArea>
        <div>Content</div>
      </ScrollArea>
    );

    expect(screen.getByText("Content")).toBeInTheDocument();
    const root = document.querySelector("[data-slot='scroll-area']");
    expect(root).toBeInTheDocument();
  });
});
