import type { AgentStatusUpdate, BridgeEvent } from "./types";

type ConvexClientOptions = {
  baseUrl: string;
  secret: string;
};

export class ConvexClient {
  private readonly ingestUrl: string;
  private readonly statusUrl: string;

  constructor(private readonly options: ConvexClientOptions) {
    // Convex HTTP routes are on .convex.site, not .convex.cloud
    // Accept either format and normalize to site URL
    const base = options.baseUrl
      .replace(/\/$/, "")
      .replace(".convex.cloud", ".convex.site");
    this.ingestUrl = `${base}/events/ingest`;
    this.statusUrl = `${base}/agents/update-status`;
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

  async updateAgentStatuses(updates: AgentStatusUpdate[]): Promise<void> {
    if (updates.length === 0) {
      return;
    }

    const response = await fetch(this.statusUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.secret}`,
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Convex status update failed (${response.status}): ${text || response.statusText}`
      );
    }
  }
}
