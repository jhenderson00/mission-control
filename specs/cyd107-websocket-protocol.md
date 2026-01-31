# CYD-107: Clawdbot WebSocket Protocol Specification

## Overview

This document defines how Mission Control connects to and receives real-time events from Clawdbot Gateway instances.

## Architecture

```
┌─────────────┐     Convex         ┌──────────────┐      HTTP        ┌──────────────┐
│  Browser    │   Subscriptions    │   Convex     │     Actions      │   Bridge     │
│  (Next.js)  │ ◄────────────────► │   Backend    │ ◄──────────────► │   Service    │
└─────────────┘                    └──────────────┘                  └──────┬───────┘
                                                                            │
                                                                            │ WebSocket
                                                                            │ (persistent)
                                                                            ▼
                                                                     ┌──────────────┐
                                                                     │  Clawdbot    │
                                                                     │  Gateway     │
                                                                     └──────────────┘
```

### Components

| Component | Responsibility |
|-----------|----------------|
| **Browser (Next.js)** | Subscribe to Convex queries for real-time UI updates |
| **Convex Backend** | Store events, provide queries/subscriptions, expose HTTP actions for bridge |
| **Bridge Service** | Maintain persistent WebSocket to Gateway, push events to Convex |
| **Clawdbot Gateway** | Emit real-time agent events over WebSocket |

### Why This Architecture?

1. **Security** — Gateway auth token stays server-side (in bridge), never exposed to browser
2. **Persistence** — Events stored in Convex for history, offline viewing, and replay
3. **Real-time** — Convex subscriptions provide automatic real-time updates to frontend
4. **Future-proof** — Bridge can connect to multiple Gateways without frontend changes

## Bridge Service

### Overview

A lightweight Node.js service that:
- Maintains persistent WebSocket connection to Clawdbot Gateway
- Authenticates using Gateway token
- Receives events and forwards them to Convex via HTTP actions
- Handles reconnection with exponential backoff

### Deployment Options

| Option | Pros | Cons |
|--------|------|------|
| **Same host as Gateway** | Low latency, shared secrets | Coupling |
| **Standalone service** | Independent scaling/deployment | Extra infrastructure |
| **Vercel/Cloudflare Worker** | Serverless, auto-scaling | WebSocket limitations |

**Recommendation:** Run on same host as Gateway initially (simplest). Can extract later if needed.

### Bridge → Convex Communication

Bridge calls Convex HTTP actions to push events:

```typescript
// Bridge pushes event to Convex
POST https://<deployment>.convex.cloud/api/actions/events:ingest
{
  "event_id": "uuid",
  "event_type": "agent.message",
  "agent_id": "main",
  "timestamp": "2026-01-31T19:00:00.000Z",
  "sequence": 12345,
  "payload": { ... }
}
```

### Bridge Authentication to Gateway

```typescript
// Bridge connects to Gateway WebSocket
const ws = new WebSocket("ws://localhost:18789");

ws.on("open", () => {
  ws.send(JSON.stringify({
    type: "req",
    id: "connect-1",
    method: "connect",
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "mission-control-bridge",
        version: "1.0.0",
        platform: "node",
        mode: "operator"
      },
      role: "operator",
      scopes: ["operator.read"],
      auth: { token: process.env.GATEWAY_TOKEN }
    }
  }));
});
```

## Gateway Event Types

### Events Mission Control Subscribes To

| Gateway Event | Mission Control Use | Maps To |
|---------------|---------------------|---------|
| `agent` | Live conversation streaming | `conversation.chunk`, `conversation.final` |
| `chat` | Message history | Activity feed |
| `presence` | Agent/client connection status | Heartbeat monitoring |
| `health` | System health | Status indicators |
| `heartbeat` | Liveness pings | Agent online/offline status |

### Event Schema (Gateway → Bridge)

Gateway events follow this structure:

```typescript
interface GatewayEvent {
  type: "event";
  event: string;           // e.g., "agent", "chat", "presence"
  payload: unknown;        // Event-specific data
  seq?: number;            // Sequence number for ordering
  stateVersion?: number;   // State version for consistency
}
```

### Agent Event Payload

```typescript
interface AgentEventPayload {
  runId: string;
  sessionKey: string;
  status: "started" | "streaming" | "done" | "error";
  
  // For streaming content
  delta?: {
    type: "text" | "tool_call" | "tool_result";
    content?: string;
    toolName?: string;
    toolInput?: unknown;
    toolOutput?: unknown;
  };
  
  // For final response
  summary?: {
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  };
}
```

### Presence Event Payload

```typescript
interface PresenceEventPayload {
  entries: {
    deviceId: string;
    roles: ("operator" | "node")[];
    scopes: string[];
    connectedAt: string;
    lastSeen: string;
  }[];
}
```

## Convex Schema

### Tables

```typescript
// convex/schema.ts

// Raw events from Gateway (immutable log)
events: defineTable({
  eventId: v.string(),
  eventType: v.string(),
  agentId: v.string(),
  sessionKey: v.optional(v.string()),
  timestamp: v.string(),
  sequence: v.number(),
  payload: v.any(),
  receivedAt: v.number(), // Convex server time
})
  .index("by_agent", ["agentId", "timestamp"])
  .index("by_session", ["sessionKey", "sequence"])
  .index("by_type", ["eventType", "timestamp"]),

// Materialized agent status (updated on each heartbeat/presence)
agentStatus: defineTable({
  agentId: v.string(),
  status: v.union(v.literal("online"), v.literal("degraded"), v.literal("offline")),
  lastHeartbeat: v.number(),
  lastActivity: v.number(),
  currentSession: v.optional(v.string()),
})
  .index("by_agent", ["agentId"]),

// Conversation messages (denormalized for fast queries)
messages: defineTable({
  sessionKey: v.string(),
  agentId: v.string(),
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
  content: v.string(),
  isStreaming: v.boolean(),
  timestamp: v.number(),
  sequence: v.number(),
})
  .index("by_session", ["sessionKey", "sequence"]),
```

### HTTP Actions (Bridge → Convex)

```typescript
// convex/events.ts

export const ingest = httpAction(async (ctx, request) => {
  const event = await request.json();
  
  // Validate event
  // Store raw event
  await ctx.runMutation(internal.events.store, event);
  
  // Update materialized views based on event type
  switch (event.eventType) {
    case "agent":
      await ctx.runMutation(internal.conversations.processAgentEvent, event);
      break;
    case "presence":
    case "heartbeat":
      await ctx.runMutation(internal.agents.updateStatus, event);
      break;
  }
  
  return new Response("ok");
});
```

## Sequence Handling & Deduplication

### Event IDs

- Every event has a unique `event_id` (UUID from Gateway or generated by bridge)
- Convex uses `event_id` for idempotent inserts (duplicate events ignored)

### Sequence Numbers

- Gateway provides `seq` on events for ordering
- Bridge tracks last received `seq` per subscription
- On reconnect, bridge can request events since last `seq` (if Gateway supports)

### Reconnection & Gap Handling

```typescript
// Bridge reconnection logic
async function reconnect() {
  const lastSeq = await getLastSequence();
  
  // Attempt to resume from last sequence
  ws.send(JSON.stringify({
    type: "req",
    method: "subscribe",
    params: { 
      events: ["agent", "presence", "heartbeat"],
      since: lastSeq  // If supported by Gateway
    }
  }));
}
```

If resume fails or Gateway doesn't support `since`:
1. Bridge fetches current state snapshot via REST (if available)
2. Convex reconciles snapshot with existing data
3. New events flow normally

## Authentication Flow

### Phase 1: Static Token

1. Gateway token stored in bridge environment (`GATEWAY_TOKEN`)
2. Convex HTTP action secret stored in bridge (`CONVEX_ACTION_SECRET`)
3. Bridge authenticates to both on startup

### Phase 2 (Future): OAuth/User Context

- Mission Control users authenticate via Clerk
- Bridge could use user-scoped tokens for per-user agent access
- Out of scope for Phase 2

## Configuration

### Bridge Environment Variables

```env
# Gateway connection
GATEWAY_URL=ws://localhost:18789
GATEWAY_TOKEN=<gateway-auth-token>

# Convex connection
CONVEX_URL=https://<deployment>.convex.cloud
CONVEX_ACTION_SECRET=<http-action-secret>

# Options
RECONNECT_INTERVAL_MS=5000
MAX_RECONNECT_ATTEMPTS=10
EVENT_BATCH_SIZE=10
EVENT_BATCH_INTERVAL_MS=100
```

### Convex Environment Variables

```env
# For validating bridge requests
BRIDGE_SECRET=<shared-secret>
```

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Direct vs proxied connection? | **Proxied** through Convex via bridge |
| One Gateway or multiple? | **One** Gateway for Phase 2, multi-Gateway later |
| Auth method? | **Static token** for Phase 2, OAuth later |

## Open Questions (Remaining)

| Question | Notes |
|----------|-------|
| Does Gateway support `since` for event replay? | Need to check Gateway code |
| What's the expected peak event rate? | Affects batching strategy |
| REST snapshot endpoint available? | For reconnection fallback |
| Should bridge run as systemd service or container? | Deployment decision |

## Success Criteria

- [ ] Protocol spec documented and reviewed
- [ ] Bridge service implemented and deployed
- [ ] Convex schema and actions implemented
- [ ] Events flowing from Gateway → Bridge → Convex → Frontend
- [ ] Reconnection works without data loss
- [ ] Latency < 500ms from Gateway event to UI update
