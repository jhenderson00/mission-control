import type { HelloOkFrame } from "./types";

type SubscriptionPlan = {
  events: string[];
  includesPresence: boolean;
};

function normalizeEventName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildSubscriptionPlan(
  hello: HelloOkFrame | null,
  baseEvents: string[]
): SubscriptionPlan {
  const events: string[] = [];
  const seen = new Set<string>();

  const addEvent = (value: string | null): void => {
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    events.push(value);
  };

  for (const event of baseEvents) {
    addEvent(normalizeEventName(event));
  }

  const advertised = hello?.features?.events;
  if (Array.isArray(advertised)) {
    for (const event of advertised) {
      addEvent(normalizeEventName(event));
    }
  }

  return {
    events,
    includesPresence: seen.has("presence"),
  };
}
