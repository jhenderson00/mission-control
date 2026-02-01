import type { AgentStatusUpdate, BridgeEvent } from "./types";

type ConvexClientOptions = {
  baseUrl: string;
  secret: string;
};

export type PendingNotification = {
  _id: string;
  _creationTime?: number;
  recipientType: "user" | "agent";
  recipientId: string;
  type: "mention";
  status: "pending" | "delivered";
  message: string;
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
  taskId?: string;
  commentId?: string;
  metadata?: unknown;
  createdAt: number;
  deliveredAt?: number;
};

export class ConvexClient {
  private readonly ingestUrl: string;
  private readonly statusUrl: string;
  private readonly notificationsPendingUrl: string;
  private readonly notificationsDeliveredUrl: string;
  private readonly notificationsAttemptUrl: string;

  constructor(private readonly options: ConvexClientOptions) {
    // Convex HTTP routes are on .convex.site, not .convex.cloud
    // Accept either format and normalize to site URL
    const base = options.baseUrl
      .replace(/\/$/, "")
      .replace(".convex.cloud", ".convex.site");
    this.ingestUrl = `${base}/events/ingest`;
    this.statusUrl = `${base}/agents/update-status`;
    this.notificationsPendingUrl = `${base}/notifications/pending`;
    this.notificationsDeliveredUrl = `${base}/notifications/mark-delivered`;
    this.notificationsAttemptUrl = `${base}/notifications/attempt`;
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

  async listPendingNotifications(options?: {
    limit?: number;
    recipientType?: "user" | "agent";
  }): Promise<PendingNotification[]> {
    const response = await fetch(this.notificationsPendingUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.secret}`,
      },
      body: JSON.stringify({
        limit: options?.limit,
        recipientType: options?.recipientType,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Convex notifications fetch failed (${response.status}): ${text || response.statusText}`
      );
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload.filter(
      (item): item is PendingNotification =>
        !!item &&
        typeof item === "object" &&
        typeof (item as PendingNotification)._id === "string" &&
        typeof (item as PendingNotification).recipientId === "string" &&
        typeof (item as PendingNotification).recipientType === "string" &&
        typeof (item as PendingNotification).message === "string"
    );
  }

  async markNotificationDelivered(
    notificationId: string,
    deliveredAt?: number
  ): Promise<void> {
    const response = await fetch(this.notificationsDeliveredUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.secret}`,
      },
      body: JSON.stringify({ notificationId, deliveredAt }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Convex notification delivery update failed (${response.status}): ${text || response.statusText}`
      );
    }
  }

  async recordNotificationAttempt(
    notificationId: string,
    error?: string
  ): Promise<void> {
    const response = await fetch(this.notificationsAttemptUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.secret}`,
      },
      body: JSON.stringify({ notificationId, error }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Convex notification attempt update failed (${response.status}): ${text || response.statusText}`
      );
    }
  }
}
