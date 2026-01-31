# PRD: CYD-96 — Phase 2: Real-time Streaming

## 1) Executive Summary
Mission Control needs true real-time visibility into Clawdbot AI agents. This epic delivers WebSocket-based streaming for live agent conversations, activity feed events, heartbeat monitoring, and connection status indicators. The outcome is a low-latency, resilient streaming layer that enhances operational awareness and supports rapid debugging while keeping UI state consistent and comprehensible.

## 2) Problem Statement & Goals
### Problem Statement
The current dashboard relies on periodic polling or delayed updates, causing operators to miss or react late to fast-moving agent decisions and failures. There is no single source of live truth for conversation output, agent liveness, or activity events.

### Goals
- Provide near-real-time streaming of agent conversation output.
- Deliver an always-updating activity feed with clear ordering and context.
- Detect and surface agent heartbeat/liveness quickly.
- Provide clear connection state feedback to the user.
- Establish a scalable WebSocket foundation for additional real-time features.

## 3) User Stories with Acceptance Criteria
### Story 1: Live Agent Conversation Streaming
**As** an operator, **I want** to see agent conversations stream live so **I can** monitor progress without refresh.

**Acceptance Criteria**
- Messages appear in the conversation view within the latency target after being emitted by Clawdbot.
- Partial/streamed content is rendered incrementally when available (token/segment updates).
- Messages are ordered correctly and deduplicated.
- The UI indicates when a message is still streaming vs finalized.

### Story 2: Real-time Activity Feed
**As** an operator, **I want** a live activity feed so **I can** track agent actions and system events as they occur.

**Acceptance Criteria**
- New feed items appear live without manual refresh.
- Feed items include timestamp, agent, and event type.
- Feed ordering is consistent and stable across reconnects.
- Users can filter by agent and event type without breaking the stream.

### Story 3: Agent Heartbeat Monitoring
**As** an operator, **I want** to see agent liveness so **I can** detect downtime or stalls quickly.

**Acceptance Criteria**
- Each agent displays a heartbeat status (Online, Degraded, Offline).
- Heartbeat transitions are reflected within the latency target.
- Missing heartbeats beyond a defined threshold cause an Offline status.
- Status recovers automatically when heartbeats resume.

### Story 4: Connection Status Indicators
**As** an operator, **I want** to know when the dashboard is connected so **I can** trust what I’m seeing.

**Acceptance Criteria**
- Connection state is shown globally (Connected, Connecting, Reconnecting, Disconnected).
- Reconnection attempts are visible and time-bounded.
- User gets a clear message when data may be stale.
- The system automatically re-subscribes after reconnect.

### Story 5: Resilient Streaming State
**As** a system, **I want** to avoid duplications or gaps so **I can** maintain data integrity across reconnects.

**Acceptance Criteria**
- The client resumes streams using last-known event IDs/offsets when possible.
- Duplicate events are ignored safely.
- When resuming fails, a consistent fallback sync occurs (e.g., fetch latest state snapshot).

### Story 6: Activity & Conversation Persistence Alignment
**As** an operator, **I want** streamed updates to match stored history so **I can** trust the timeline.

**Acceptance Criteria**
- Streamed events are persisted in Convex (or a designated store) and match displayed content.
- Re-loading the page shows the same content as what was streamed.
- Activity feed aligns with conversation timeline for the same agent.

## 4) Technical Requirements
### WebSocket Architecture
- WebSocket client in the Next.js app that connects to Clawdbot streaming endpoint.
- Support for authenticated connections (token or signed nonce from server).
- A central stream manager (client-side) handles:
  - Connection lifecycle
  - Subscriptions per agent or global topics
  - Deduplication and ordering
  - Backoff + reconnection

### Clawdbot Integration Points
- Define Clawdbot message protocol (JSON payloads) with:
  - `event_id`, `timestamp`, `agent_id`, `type`, `payload`, `sequence`
- Event types (minimum):
  - `conversation.chunk`, `conversation.final`
  - `activity.event`
  - `heartbeat`
  - `system.status`
- Expected API methods:
  - WebSocket URL for streaming
  - Auth handshake endpoint
  - Optional REST snapshot endpoint for re-sync

### State Management (Client)
- Use a lightweight client store (e.g., Zustand or Context+Reducer) to:
  - Normalize agent states and event history
  - Manage conversation buffers and streaming flags
  - Maintain connection state machine
- Apply event ordering using sequence IDs or timestamps with tie-breakers.
- Use optimistic UI for connection status changes.

### Convex Integration
- Streamed events are persisted to Convex via mutations (batched where possible).
- Activity feed and conversation history should be queryable via Convex queries.
- Convex indexes for recent events per agent and global feed.

## 5) UI/UX Requirements
### Streaming UI
- Conversation view renders messages progressively with a “streaming” indicator.
- Activity feed shows the latest events at top (or bottom; choose one and keep consistent).
- Heartbeat indicator visible in agent list and agent detail header.

### Connection States
- Global connection badge in header:
  - Connected (green), Connecting (amber), Reconnecting (amber), Disconnected (red)
- Banner or toast for prolonged disconnection (> N seconds).

### Loading & Error States
- Initial loading skeleton for conversations and feed.
- If disconnected, show cached data with a “stale” indicator.
- Explicit error UI if authentication to stream fails.

### Responsiveness
- Mobile view prioritizes:
  - Connection status
  - Current agent state
  - Latest activity items

## 6) Non-functional Requirements
- **Latency:** 500ms p95 from Clawdbot event emission to UI render.
- **Reliability:** 99.5% connection availability during active sessions.
- **Reconnection Handling:** Exponential backoff with jitter; auto-resubscribe.
- **Ordering:** Client must handle out-of-order events safely.
- **Scalability:** Support at least 200 concurrent agents with stream updates.

## 7) Dependencies & Assumptions
- Clawdbot provides WebSocket endpoint and event protocol.
- Authentication mechanism is compatible with Clerk and Next.js (token/nonce).
- Convex can handle streaming event ingestion at expected throughput.
- Stable event IDs/sequence numbers are available for dedupe.

## 8) Success Metrics
- 90% of sessions show live updates without manual refresh.
- Average reconnection time < 3 seconds.
- <1% of events are missing or duplicated in the UI.
- User-reported latency complaints reduced by 80% post-launch.

## 9) Out of Scope
- Historical analytics or long-term event warehousing.
- Multi-region WebSocket load balancing.
- Advanced replay/rewind functionality for past streams.
- In-app alerting/notifications beyond connection status.

## 10) Open Questions
1. What is the final WebSocket message schema from Clawdbot?
2. How should authentication be handled (JWT, short-lived token, signed nonce)?
3. What is the expected peak event rate per agent?
4. Should the activity feed be global-first or agent-specific by default?
5. Should the conversation stream support markdown rendering or plain text only?
6. What is the required retention window in Convex for streaming events?
7. Is there a fallback REST endpoint for snapshot sync after long disconnects?

