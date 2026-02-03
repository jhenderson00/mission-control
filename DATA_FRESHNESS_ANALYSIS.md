# Data Freshness Analysis (Issue #33)

## Summary
The dashboard “Data freshness warning” is driven by the client-side `useStateSync` freshness check. It flags stale data when the **latest event timestamp** in any registered subscription is older than 5 minutes. The warning can appear even while agents are active because freshness uses **source event timestamps** (and agent status timestamps derived from presence/heartbeat) rather than **ingest time** or **last data arrival time**. If those timestamps are old or rarely updated, the banner will show “Last update Xm ago” despite new activity.

## Where Freshness Is Calculated
- **Stale threshold:** `DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000` in `src/lib/realtime/state-sync.ts`.
- **Stale calculation:** `isStale = latestEventTime > 0 && now - latestEventTime > staleAfterMs` when new items arrive in `useStateSync` (`src/lib/realtime/state-sync.ts`).
- **Latest event time:** computed as `max(getTimestamp(item))` across items. Each hook supplies `getTimestamp`:
  - Activity feed uses `event.createdAt` (`src/lib/realtime/use-activity-feed.ts`).
  - Agent status uses `max(lastActivity, lastHeartbeat)` (`src/lib/realtime/use-agent-status.ts`).
  - Conversation uses message `timestamp` (`src/lib/realtime/use-conversation.ts`).
  - Context graph uses node `createdAt` (`src/lib/realtime/use-context-graph.ts`).
- **Banner trigger:** The connection banner shows when **any** subscription has `isStale` (`src/components/dashboard/connection-badge.tsx`). The “Last update …” label uses the **max `lastEventTime` across subscriptions**, not when data was received.

## Data Flow (Bridge → Convex → UI)
1. **Gateway → Bridge**: `Bridge.handleGatewayEvent` normalizes each event and assigns a timestamp from payload (`payload.timestamp` or `payload.createdAt`) or falls back to `new Date().toISOString()` if missing (`bridge/src/index.ts`).
2. **Bridge → Convex**: Events are buffered and POSTed to `/events/ingest` (`bridge/src/convex-client.ts` → `convex/events.ts`).
3. **Convex ingest**:
   - Stores each event with `timestamp` (string from Bridge) and `receivedAt = Date.now()` (`convex/events.ts`).
   - For `presence` and `heartbeat` events, updates agent status (`convex/agents.ts: updateStatusFromEvent`).
4. **Convex queries → UI**:
   - `listRecent` returns `createdAt = normalizeTimestamp(event.timestamp, event.receivedAt)` (`convex/events.ts`).
   - `listStatus` returns `lastActivity` / `lastHeartbeat` values (updated via presence/heartbeat or bridge status updates) (`convex/agents.ts`).
5. **UI freshness**:
   - `useStateSync` compares **current time** to **event timestamps** (`createdAt`, `lastActivity`, etc.) and flags stale when older than 5 minutes.

## Why the Warning Appears Despite Recent Activity
Observed behavior (“Last update 17m ago” even with recent activity) can happen under any of these conditions:

1. **Event timestamps reflect source time, not ingest time.**
   - `createdAt` uses `event.timestamp` (payload-derived) when it parses successfully, even if it is old.
   - If the gateway/agents send timestamps that lag or are skewed, the UI treats new events as old and marks stale.

2. **Agent status timestamps only update on presence/heartbeat/health.**
   - `lastActivity` and `lastHeartbeat` are only updated by presence/heartbeat events (and by bridge health snapshots via `/agents/update-status`).
   - Regular `agent`/`chat` activity does **not** update agent status, so the status timestamps can remain old even while activity is high.
   - Because the banner checks **any** subscription’s `isStale`, a stale agent-status subscription will trigger the warning regardless of activity feed freshness.

3. **Static/historical datasets get flagged as stale by design.**
   - The freshness check assumes ongoing updates; if a dataset is expected to be static (context graph snapshots, old conversations), it will still be marked stale after 5 minutes.

## Recommendations
### A) Separate “event time” from “data arrival time” for freshness
- Add/return `receivedAt` (ingest time) to activity feed and use it for freshness calculations.
- Update `useStateSync` calls to use `Math.max(createdAt, receivedAt)` or a dedicated `lastSeenAt` field to avoid clock skew.

### B) Update agent status on all activity events
- In `convex/events.ingest`, update agent status on `agent` and `chat` events (and possibly tool/diagnostic events) so `lastActivity` reflects real activity even when heartbeat/presence is absent.
- Use `receivedAt` or normalized event time for `lastActivity` to avoid stale source timestamps.

### C) Tune or disable stale detection per subscription
- Increase `staleAfterMs` for data sources that are naturally slower (e.g., context graph) or disable stale detection for historical views.
- Optionally expose a per-hook `staleAfterMs` override for activity vs. status feeds.

### D) Consider a unified “freshness” signal
- Maintain a single “last data ingest” timestamp in the connection store whenever **any** realtime query updates, and base the banner on that instead of per-subscription event timestamps.

## Implementation Plan for Friday
1. **Instrument freshness source (small code change):**
   - Add `receivedAt` to `NormalizedEvent` in `convex/events.ts` and return it from `listRecent`.
   - Update `useActivityFeed` to use `getTimestamp: (event) => Math.max(event.createdAt, event.receivedAt)`.

2. **Agent status activity updates:**
   - Extend `convex/events.ingest` to call a new internal mutation that updates `agentStatus.lastActivity` for `agent` and `chat` events using `receivedAt`.
   - Keep heartbeat/presence handling unchanged, but let activity events refresh `lastActivity` to prevent false staleness.

3. **Per-subscription stale tuning:**
   - Add `staleAfterMs` overrides to `useAgentStatus` and `useContextGraph` (e.g., 15–30 min or `Infinity` for graph snapshots).
   - Ensure the banner uses the **max** of updated freshness timestamps (or consider a single global ingest marker).

4. **Validation:**
   - Add a quick unit test in `src/lib/realtime/state-sync.test.tsx` to ensure a new event with old `createdAt` but recent `receivedAt` does not mark stale.
   - Verify banner no longer shows “Data freshness warning” during active event ingestion.

## Files Touched/Reviewed
- `src/lib/realtime/state-sync.ts`
- `src/components/dashboard/connection-badge.tsx`
- `src/lib/realtime/use-activity-feed.ts`
- `src/lib/realtime/use-agent-status.ts`
- `bridge/src/index.ts`
- `bridge/src/convex-client.ts`
- `convex/events.ts`
- `convex/agents.ts`
