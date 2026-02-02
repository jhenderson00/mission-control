// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractDiagnosticEvents } from "./diagnostics";

describe("extractDiagnosticEvents", () => {
  it("extracts diagnostic entries from payload fields", () => {
    const payload = {
      diagnostic: { type: "Warning", message: "Latency spike" },
      diagnostics: [
        { level: "info", message: "Trace recorded" },
        { eventType: "diagnostic.custom", detail: "Custom event" },
      ],
    };

    const events = extractDiagnosticEvents(payload);

    expect(events).toEqual([
      {
        eventType: "diagnostic.warning",
        payload: { type: "Warning", message: "Latency spike" },
      },
      {
        eventType: "diagnostic.info",
        payload: { level: "info", message: "Trace recorded" },
      },
      {
        eventType: "diagnostic.custom",
        payload: { eventType: "diagnostic.custom", detail: "Custom event" },
      },
    ]);
  });

  it("extracts diagnostic entries from delta payloads", () => {
    const payload = {
      delta: {
        type: "diagnostic",
        name: "trace",
        message: "Span recorded",
      },
    };

    const events = extractDiagnosticEvents(
      payload,
      payload.delta as Record<string, unknown>
    );

    expect(events).toEqual([
      {
        eventType: "diagnostic.trace",
        payload: {
          type: "diagnostic",
          name: "trace",
          message: "Span recorded",
        },
      },
    ]);
  });

  it("handles string diagnostics", () => {
    const payload = { diagnostic: "Disk pressure" };
    const events = extractDiagnosticEvents(payload);

    expect(events).toEqual([
      {
        eventType: "diagnostic",
        payload: { message: "Disk pressure" },
      },
    ]);
  });
});
