# CYD-136 Context Graph Research Analysis

## 1. Executive Summary
The Context Graph is a visualization layer that connects agent decisions, reasoning steps, tool usage, and task dependencies into a single explorable graph. It matters because the system already captures rich telemetry (decisions, events, conversations, task hierarchies), but operators currently consume these streams in isolated lists. A graph view should unify these sources to explain "why" and "how" a decision happened, trace upstream context, and show downstream impacts (handoffs, blockers, and outcomes).

## 2. Current State (Codebase Findings)

### Existing data structures
- `convex/schema.ts`
  - `decisions` table already exists and is explicitly labeled as "Context graph nodes for traceable reasoning". Fields include `decision`, `reasoning`, `confidence`, `alternativesConsidered`, `contextRefs`, `outcome`, and `parentDecisionId`.
  - `events` table stores raw Gateway telemetry (`eventType`, `payload`, `sourceEventId`, `runId`, `sessionKey`, etc.) with indexes by agent, session, and type.
  - `messages` table stores conversation messages derived from agent and chat events (`role`, `content`, `sequence`, `isStreaming`).
  - `tasks` include `parentTaskId` (hierarchy), `assignedAgentIds`, `blockedReason`, `output`, and timestamps.
  - `agentStatus` and `agentWorkingMemory` provide real-time presence and working context snapshots.

- `convex/decisions.ts`
  - Query support exists for listing decisions by agent/task, recent decisions, pending count, and `getWithChain` (walks `parentDecisionId`).
  - Decisions are recorded via `record` mutation and resolved via `resolve`.

- `convex/events.ts`
  - Normalizes events into a simplified Activity feed entry (`type`, `content`, `createdAt`).
  - Recognizes `tool_call`, `tool_result`, `thinking`, `token_usage`, `error`, and other types for human-readable summaries.
  - Events include optional `sourceEventId` and `sourceEventType` which could link related events.

- `convex/conversations.ts`
  - Materializes streaming agent events into `messages` for a session.
  - Tool calls and results are stored as JSON strings in `content` when the delta type is not text.

### Existing UI patterns
- `src/app/(dashboard)/graph/page.tsx` is a placeholder that lists recent decisions as cards (with fallback mock nodes if Convex is not configured); no edges or visualization yet.
- Activity feed is implemented in `src/components/activity/*` using `Card`, `Badge`, `ScrollArea`, and filter controls.
- Agent detail uses cards for recent events, decision log, and conversation; the design pattern is consistent across pages:
  - `PageHeader` + `Card` sections
  - Scrollable panels for streams
  - Badges for statuses and types

### Real-time patterns
- `src/lib/realtime/use-activity-feed.ts` and `use-conversation.ts` rely on Convex queries and a `useStateSync` helper for gap/staleness detection.
- This same pattern can drive a graph view for live updates (decision nodes, tool calls, etc.).

### Activity feed behavior
- Activity feed is powered by `events.listRecent` (Convex), returning normalized event entries with human-readable `content` computed in `convex/events.ts`.
- Client-side filters (agent + event type) are applied in the UI; the query itself supports an optional event-type filter only.
- Event types recognized for summaries include `tool_call`, `tool_result`, `thinking`, `token_usage`, `error`, `presence`, `health`, and `heartbeat`.

### ID linkage caveat
- `events.agentId` is a gateway/bridge string, while `decisions.agentId` is a Convex `Id<"agents">`.
- `convex/agentLinking.ts` provides translation helpers (notably `resolveBridgeAgentId` and `resolveConvexAgentId`) which should be used to connect events, decisions, and agents in the graph layer.

### Visualization libraries
- No visualization or graph libraries are currently installed (no React Flow, D3, visx, etc.).
- The UI is built with shadcn/ui components and Tailwind, with a dark theme and coral accent.

## 3. Data Model Recommendations

### A. Extend existing decision data
The current `decisions` schema is a solid foundation but lacks explicit linkage to events, sessions, and tool usage.

Recommended additions to `decisions`:
- `sessionKey?: string` and/or `runId?: string` for linking to conversation and event streams.
- `sourceEventId?: string` to connect a decision to a specific Gateway event.
- `decisionType?: string` or enum (planning, execution, review, escalation) to group nodes.
- `importance?: "low" | "medium" | "high" | "critical"` for UI emphasis.
- `tags?: string[]` for filtering.

### B. Model graph edges explicitly
`parentDecisionId` supports only a linear chain. A Context Graph needs DAG support (multiple parents/children).

Options:
1) **General graph edge table** (recommended):
   - `contextEdges`: `{ fromType, fromId, toType, toId, relation, weight?, createdAt }`
   - `fromType/toType` could be `decision | task | event | message | agent | tool`.
   - `relation` examples: `depends_on`, `caused_by`, `uses_tool`, `hands_off_to`, `references`.

2) **Decision-only edges** (simpler but less flexible):
   - `decisionEdges`: `{ fromDecisionId, toDecisionId, relation, createdAt }`.

### C. Capture tool usage in a structured form
Tool usage is currently embedded in `events.payload` or JSON strings in `messages`.

Recommended additions:
- `toolCalls` table materialized from events:
  - `eventId`, `agentId`, `sessionKey`, `toolName`, `inputSummary`, `outputSummary`, `status`, `durationMs`, `createdAt`.
- Optionally retain raw tool input/output in `events` and store summaries in `toolCalls` to avoid large blobs.

### D. Task dependencies and handoffs
Tasks currently support `parentTaskId` only (single parent).

Recommended additions:
- `taskDependencies` table: `{ fromTaskId, toTaskId, relation, createdAt }`.
  - `relation`: `blocks`, `unblocks`, `requires`, `duplicates`.
- `taskAssignments` or `taskHandoffs` table to preserve history:
  - `{ taskId, fromAgentId?, toAgentId?, reason?, createdAt }`.

### E. Link events and messages to graph
Introduce light-weight references to enable graph building without complex joins:
- Add `contextRefs` to events (or store edges that connect `eventId -> decisionId` / `taskId`).
- Add `messageId` references in decisions (or edges from decision to message sequences).

## 4. UI Recommendations

### A. Core layout
Use the existing page structure:
- `PageHeader` with a short description and an optional "Live" or "Graph" badge.
- Primary `Card` containing the graph canvas.
- Secondary side panel (scrollable) with node detail, filters, and legend.

Suggested structure:
- Top: Graph controls (time range, agent filter, event type toggles).
- Main panel: Graph visualization (interactive canvas).
- Right panel: Details for selected node and its chain (decision summary, reasoning, context refs, tool usage).

### B. Visualization approach (no library yet)
Since there is no graph library installed, consider one of these:
- **React Flow**: quickest for node/edge graph with built-in zoom/pan, minimap, and edge types.
- **D3 (or visx)**: more control for custom layouts (timeline + DAG hybrid), but higher implementation cost.
- **Hybrid timeline + tree**: render a timeline of decisions with expandable sub-graphs for tool usage and reasoning steps.

Given the need for decision chains and tool usage, a **DAG layout with timeline alignment** is likely the best operator experience.

### C. Node and edge design
Align with existing status colors and badges:
- Decision nodes: outline + badge for outcome (pending/accepted/rejected).
- Tool nodes: smaller pills with tool name and status.
- Task nodes: larger cards with priority and state.
- Agent nodes: compact chips showing agent name and type.

### D. Reuse existing UI patterns
- Use `Card`, `Badge`, `ScrollArea`, `Button` from shadcn/ui for side panel and filters.
- Activity feed filter pattern (agent + event type) can be reused for graph filters.
- Use the `useStateSync` pattern to detect data gaps and show a "stale data" indicator if needed.

## 5. Implementation Roadmap (For Friday)

1) **Data layer enhancements**
   - Decide on edge model (general `contextEdges` vs decision-only edges).
   - Add fields to `decisions` for `sessionKey/runId` and any other required linkage.
   - Add `toolCalls` (materialized) and/or `taskDependencies` + `taskHandoffs` tables.

2) **Ingestion and linkage rules**
   - Define how events map to decisions, tools, and tasks.
   - Write mutations that create edges from:
     - Decision -> parent decision(s)
     - Decision -> task
     - Decision -> tool usage
     - Task -> task dependencies
     - Handoff events -> agent-to-agent edges

3) **Queries for graph view**
   - Create a single query that returns nodes + edges for a given filter (agent, task, time range).
   - Include summaries for quick UI display (decision text, tool name, task title).

4) **UI foundation**
   - Replace placeholder grid in `graph/page.tsx` with a two-panel layout.
   - Add filters and a detail inspector panel.
   - Integrate a graph library (or custom layout) and render nodes/edges.

5) **Polish and validation**
   - Ensure real-time updates with Convex subscriptions.
   - Add loading/empty states that match existing patterns.
   - Add tests for graph query and basic UI states.

## 6. Open Questions

1) **Graph scope**: Should Context Graph include only decisions, or also tasks/events/messages by default?
2) **Linking rules**: What is the source of truth for connecting decisions to specific events or messages?
3) **Tool data retention**: Do we store raw tool inputs/outputs in graph nodes, or only summaries?
4) **Task handoff definition**: What signals identify a handoff (assignment change, explicit event, control command)?
5) **Scale limits**: What is the expected max node count for a single graph view (to guide pagination or time-windowing)?
6) **Operator workflows**: Should the graph default to an agent-centric view or task-centric view?
