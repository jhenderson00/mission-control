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

### Reconnection & Gap Handling

**Important:** Gateway does **NOT** replay events. From Gateway docs:
> "Events are not replayed; clients must refresh on gaps."

**Reconnection Strategy:**

1. **On initial connect:** `hello-ok` response includes snapshot of `presence` + `health`
2. **On reconnect:** Bridge must fetch current state via request methods:
   - `system-presence` → current presence entries
   - `chat.history` → recent messages per session
   - `sessions.list` → active sessions
3. **Reconciliation:** Bridge compares fetched state with last known state in Convex
4. **Resume:** New events flow normally after state sync

```typescript
// Bridge reconnection logic
async function onReconnect() {
  // 1. Connect and get hello-ok snapshot
  const helloOk = await connect();
  
  // 2. Fetch current state
  const [presence, sessions] = await Promise.all([
    request("system-presence"),
    request("sessions.list")
  ]);
  
  // 3. For each active session, fetch recent history
  for (const session of sessions) {
    const history = await request("chat.history", { 
      sessionKey: session.key,
      limit: 50 
    });
    await syncHistoryToConvex(session.key, history);
  }
  
  // 4. Update presence/status in Convex
  await syncPresenceToConvex(presence);
  
  // 5. Resume event streaming
}
```

**Gap Detection:**
- Bridge tracks `lastEventTime` per subscription
- If reconnect happens after >N seconds, full state sync is triggered
- For short gaps (<5s), may skip full sync and just resume

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
| Does Gateway support `since` for event replay? | **No** — events are not replayed. Use `chat.history`, `sessions.list`, `system-presence` to fetch state on reconnect |
| REST snapshot endpoint available? | **Yes** — via Gateway WS methods: `chat.history`, `sessions.list`, `system-presence`. Also `hello-ok` includes presence + health snapshot |

## Open Questions (Remaining)

| Question | Notes |
|----------|-------|
| What's the expected peak event rate? | Affects batching strategy. Estimate: streaming tokens could be 10-50 events/sec during active response |
| Should bridge run as systemd service or container? | Deployment decision — recommend systemd on same host as Gateway initially |
| Gap threshold for full state sync? | Propose 5 seconds — if disconnected longer, do full sync |

## Event Rate Estimates

| Event Type | Expected Rate | Notes |
|------------|---------------|-------|
| `agent` (streaming) | 10-50/sec during response | Token-by-token streaming |
| `agent` (done) | 1 per response | Final message |
| `heartbeat` | 1 per 15-30 sec per agent | Configurable interval |
| `presence` | On connect/disconnect | Low frequency |
| `chat` | 1 per message | User + assistant messages |

**Batching Strategy:**
- Bridge should batch events before pushing to Convex (100ms window or 10 events, whichever first)
- Streaming tokens can be aggregated client-side for smoother rendering

## Bridge Service Implementation Plan

### Technology Stack

- **Runtime:** Node.js (same as Clawdbot)
- **WebSocket Client:** `ws` package
- **HTTP Client:** `fetch` (native) for Convex HTTP actions
- **Process Manager:** systemd (Linux) or launchd (macOS)

### File Structure

```
bridge/
├── src/
│   ├── index.ts          # Entry point
│   ├── gateway-client.ts # WebSocket connection to Gateway
│   ├── convex-client.ts  # HTTP actions to Convex
│   ├── event-buffer.ts   # Batching logic
│   ├── state-sync.ts     # Reconnection state sync
│   └── types.ts          # Shared types
├── package.json
├── tsconfig.json
└── README.md
```

### Core Logic

```typescript
// Simplified bridge flow
class Bridge {
  private ws: WebSocket;
  private eventBuffer: EventBuffer;
  private lastEventTime: number;

  async start() {
    await this.connect();
    await this.initialSync();
    this.startHeartbeat();
  }

  async connect() {
    this.ws = new WebSocket(process.env.GATEWAY_URL);
    
    this.ws.on("message", (data) => {
      const frame = JSON.parse(data);
      if (frame.type === "event") {
        this.handleEvent(frame);
      }
    });

    this.ws.on("close", () => this.reconnect());
    
    // Send connect request
    await this.authenticate();
  }

  handleEvent(frame: GatewayEvent) {
    this.lastEventTime = Date.now();
    this.eventBuffer.add(frame);
  }

  async flushEvents() {
    const batch = this.eventBuffer.drain();
    if (batch.length > 0) {
      await convexClient.ingestEvents(batch);
    }
  }
}
```

### Deployment (Phase 1)

1. **Location:** Same host as Clawdbot Gateway
2. **Process:** systemd service (or launchd on macOS)
3. **Logging:** stdout → journald (or file rotation)
4. **Monitoring:** Health endpoint on localhost for basic checks

```ini
# /etc/systemd/system/mission-control-bridge.service
[Unit]
Description=Mission Control Bridge
After=network.target

[Service]
Type=simple
User=clawdbot
WorkingDirectory=/opt/mission-control-bridge
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Future Improvements (Phase 3+)

- Container deployment for easier scaling
- Multiple Gateway support (bridge per Gateway or aggregated)
- Metrics export (Prometheus)
- Dead letter queue for failed Convex pushes

## Success Criteria

- [ ] Protocol spec documented and reviewed
- [ ] Bridge service implemented and deployed
- [ ] Convex schema and actions implemented
- [ ] Events flowing from Gateway → Bridge → Convex → Frontend
- [ ] Reconnection works without data loss
- [ ] Latency < 500ms from Gateway event to UI update
