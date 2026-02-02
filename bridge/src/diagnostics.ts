type DiagnosticEvent = {
  eventType: string;
  payload: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function resolveString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeDiagnosticEventType(value: string | null): string {
  if (!value) {
    return "diagnostic";
  }
  const normalized = value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
  if (!normalized) {
    return "diagnostic";
  }
  if (normalized === "diagnostic") {
    return "diagnostic";
  }
  if (normalized.startsWith("diagnostic.")) {
    return normalized;
  }
  if (normalized.startsWith("diagnostic_")) {
    return `diagnostic.${normalized.slice("diagnostic_".length)}`;
  }
  return `diagnostic.${normalized}`;
}

function collectDiagnosticEntries(
  source: unknown,
  entries: Record<string, unknown>[]
): void {
  if (!source) {
    return;
  }
  if (Array.isArray(source)) {
    for (const entry of source) {
      collectDiagnosticEntries(entry, entries);
    }
    return;
  }
  if (typeof source === "string") {
    entries.push({ message: source });
    return;
  }
  const record = asRecord(source);
  if (!record) {
    return;
  }
  const nested =
    (Array.isArray(record.entries) ? record.entries : null) ??
    (Array.isArray(record.events) ? record.events : null) ??
    (Array.isArray(record.items) ? record.items : null);
  if (nested) {
    for (const entry of nested) {
      collectDiagnosticEntries(entry, entries);
    }
    return;
  }
  entries.push(record);
}

export function extractDiagnosticEvents(
  payload: Record<string, unknown>,
  delta?: Record<string, unknown> | null
): DiagnosticEvent[] {
  const entries: Record<string, unknown>[] = [];

  collectDiagnosticEntries(payload.diagnostic, entries);
  collectDiagnosticEntries(payload.diagnostics, entries);
  collectDiagnosticEntries(payload.diagnosticEvent, entries);
  collectDiagnosticEntries(payload.diagnosticEvents, entries);

  if (delta) {
    const deltaType = resolveString(delta.type);
    if (deltaType === "diagnostic") {
      collectDiagnosticEntries(delta, entries);
    }
    collectDiagnosticEntries(delta.diagnostic, entries);
    collectDiagnosticEntries(delta.diagnostics, entries);
    collectDiagnosticEntries(delta.diagnosticEvent, entries);
    collectDiagnosticEntries(delta.diagnosticEvents, entries);
  }

  return entries.map((entry) => {
    const explicitType = resolveString(entry.eventType);
    const type = resolveString(entry.type);
    const name =
      resolveString(entry.name) ??
      resolveString(entry.kind) ??
      resolveString(entry.category);
    const level = resolveString(entry.level) ?? resolveString(entry.severity);
    const rawType =
      explicitType ??
      (type && type !== "diagnostic" ? type : null) ??
      name ??
      type ??
      level;
    return {
      eventType: normalizeDiagnosticEventType(rawType),
      payload: entry,
    };
  });
}
