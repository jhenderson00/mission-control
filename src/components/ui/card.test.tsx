import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

describe("Card", () => {
  it("renders card sections", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <CardContent>Content</CardContent>
      </Card>
    );

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});
