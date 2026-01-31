import type { BridgeEvent } from "./types";

export class EventBuffer {
  private buffer: BridgeEvent[] = [];

  constructor(private readonly batchSize: number) {}

  add(event: BridgeEvent): boolean {
    this.buffer.push(event);
    return this.buffer.length >= this.batchSize;
  }

  drain(): BridgeEvent[] {
    if (this.buffer.length === 0) {
      return [];
    }
    const drained = this.buffer;
    this.buffer = [];
    return drained;
  }

  requeue(events: BridgeEvent[]): void {
    if (events.length === 0) {
      return;
    }
    this.buffer = [...events, ...this.buffer];
  }

  size(): number {
    return this.buffer.length;
  }
}
