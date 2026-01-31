import type { BridgeEvent } from "./types";

type ConvexClientOptions = {
  baseUrl: string;
  secret: string;
};

export class ConvexClient {
  private readonly ingestUrl: string;

  constructor(private readonly options: ConvexClientOptions) {
    const base = options.baseUrl.replace(/\/$/, "");
    this.ingestUrl = `${base}/api/http/events/ingest`;
  }

  async ingestEvents(events: BridgeEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const response = await fetch(this.ingestUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.secret}`,
      },
      body: JSON.stringify(events),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Convex ingest failed (${response.status}): ${text || response.statusText}`
      );
    }
  }
}
