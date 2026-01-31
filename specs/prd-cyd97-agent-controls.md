# PRD: CYD-97 — Phase 3: Agent Controls

## 1) Executive Summary
Phase 3 delivers operational controls for the Clawdbot agent fleet inside Mission Control. Operators will be able to pause/resume agents, redirect them to new tasks, kill or restart sessions, override task priority, and perform these actions in bulk. The epic builds on Phase 2’s real-time infrastructure, using the existing bridge + Convex flow to dispatch control commands and to surface reliable, auditable outcomes with optimistic UI feedback.

## 2) Problem Statement & Goals
### Problem Statement
Mission Control currently provides real-time visibility (Phase 2) but no operational controls. Operators must leave the dashboard, use ad-hoc tools, or wait for agents to finish, slowing response times when a fleet needs to be paused, reprioritized, or recovered from failures. There is no structured control surface, no audit trail, and no bulk operations for fleet-level management.

### Goals
- Provide safe, reliable controls for individual agents and the fleet (pause/resume, redirect, kill/restart, priority override).
- Surface command status clearly (pending, acknowledged, failed) with optimistic UI updates and rollback.
- Log every control action with operator identity, timestamps, and outcomes.
- Enable bulk actions with safeguards and confirmations.
- Reuse existing real-time patterns (bridge WebSocket, Convex actions, client hooks).

## 3) User Stories with Acceptance Criteria
### Story 1: Pause / Resume an Agent
**As** an operator, **I want** to pause or resume an agent so **I can** stop or restart work quickly without losing visibility.

**Acceptance Criteria**
- The agent control panel exposes “Pause” and “Resume” actions.
- Pause/resume commands are sent to the gateway with a unique operation ID.
- UI shows a pending state within 200ms of user action.
- The agent status reflects the outcome when the gateway acknowledges the change.
- If a command fails or times out, UI reverts and shows an error toast with retry.

### Story 2: Redirect an Agent to a New Task
**As** an operator, **I want** to redirect an agent to a new task so **I can** change its focus without restarting the session.

**Acceptance Criteria**
- The redirect action accepts a task reference or inline task payload.
- A summary of the new task is shown in the confirmation dialog.
- The agent’s current task card updates optimistically and is corrected if the command fails.
- Redirect updates are reflected in activity feed and audit log.

### Story 3: Kill / Restart an Agent Session
**As** an operator, **I want** to kill or restart a session so **I can** recover from stuck or failed agents.

**Acceptance Criteria**
- Destructive actions require explicit confirmation (type agent name or “CONFIRM”).
- A kill command ends the active session and sets status to “offline” or “idle” per gateway response.
- A restart command spins up a new session and updates the current session key.
- The UI shows a “restarting” pending state with a clear timeout.
- All kill/restart actions are recorded in audit logs.

### Story 4: Priority Override
**As** an operator, **I want** to override agent or task priority so **I can** ensure critical work is executed first.

**Acceptance Criteria**
- Priority override supports at least: low, medium, high, critical.
- Overrides can be time-bounded (duration or until cleared).
- UI indicates overridden priority distinct from inherited task priority.
- Removing an override restores default priority and logs the change.

### Story 5: Bulk Operations
**As** an operator, **I want** to select multiple agents and apply a control action so **I can** manage the fleet efficiently.

**Acceptance Criteria**
- Agent list supports multi-select with a persistent bulk action bar.
- Bulk actions include pause, resume, priority override, and kill (guarded).
- Each agent shows per-item progress (success/failure) within the bulk operation.
- Partial failures are surfaced with a retry path for failed agents only.

### Story 6: Command Status & Pending Operations
**As** an operator, **I want** to track command status so **I can** trust whether the fleet is in the intended state.

**Acceptance Criteria**
- Each control action creates a pending operation record with status (queued, sent, acked, failed, timed-out).
- Pending operations are visible in the agent detail view and in bulk UI.
- Operations auto-resolve when a matching gateway acknowledgment arrives.

### Story 7: Audit & Compliance
**As** an admin, **I want** a complete audit trail of control actions so **I can** review who changed what and when.

**Acceptance Criteria**
- Audit log includes operator identity, timestamp, agent(s), command type, parameters, and outcome.
- Audit entries are queryable per agent and via a global filter.
- Audit entries are immutable and retained for the configured retention window.

## 4) Technical Requirements
### Clawdbot Gateway Integration
Gateway control methods should be invoked through the existing bridge WebSocket client (`GatewayClient.request`). Proposed method contract (final names subject to gateway spec):
- `agent.pause` → `{ agentId, reason?, requestId }`
- `agent.resume` → `{ agentId, requestId }`
- `agent.redirect` → `{ agentId, taskId? , taskPayload?, priority?, requestId }`
- `agent.kill` → `{ agentId, sessionKey?, requestId, force? }`
- `agent.restart` → `{ agentId, requestId }`
- `agent.priority.override` → `{ agentId, priority, durationMs?, requestId }`
- `agents.bulk` → `{ agentIds, command, params, requestId }`

Gateway must return an acknowledgment payload that includes the original `requestId` and a status (`accepted`, `rejected`, `error`). A follow-up event (e.g., `control.status`) should confirm final application when state changes are completed.

### Convex Actions for Control Commands
- Add Convex actions (e.g., `controls.dispatch`, `controls.bulkDispatch`) that forward control commands to the bridge.
- The bridge should expose a minimal authenticated control endpoint (HTTP) that uses its persistent WebSocket connection to call `GatewayClient.request`.
- Convex actions must:
  - Validate input with Zod
  - Attach operator identity (Clerk user ID) and requestId
  - Persist a pending operation record before dispatch
  - Update status on ack/failure and write audit logs

### State Management for Pending Operations
- Introduce a `agentControlOperations` table in Convex:
  - `operationId`, `agentId(s)`, `command`, `params`, `status`, `requestedBy`, `requestedAt`, `ackedAt`, `completedAt`, `error`
- Provide queries for:
  - Active operations by agent
  - Recent operations by operator
  - Bulk operation breakdowns
- The client uses a small local store (Zustand or React state) to stage optimistic updates while subscribing to Convex status updates.

### Optimistic UI Updates
- For non-destructive commands (pause/resume/priority override/redirect):
  - Optimistically update the UI immediately with a “pending” badge.
  - Reconcile on ack or revert on failure.
- For destructive commands (kill/restart):
  - Show “pending” state but avoid full optimistic status flip until ack.
  - Provide clear progress and timeout messaging.

## 5) UI/UX Requirements
### Control Panel Design
- Agent detail view includes a dedicated **Control Panel** card with grouped actions:
  - Primary: Pause/Resume, Redirect
  - Secondary: Priority Override
  - Destructive: Kill, Restart
- Controls should use shadcn/ui buttons and dialog components with clear labels and iconography.
- Each action shows status feedback inline (pending, success, failed) with subtle progress indicators.

### Confirmation Dialogs
- Kill/Restart require explicit confirmation (typing agent name or “CONFIRM”).
- Redirect and priority override require a quick review summary before dispatch.
- All dialogs should include the current agent status, session key, and last heartbeat.

### Bulk Selection UI
- Agent list view supports multi-select checkboxes.
- A sticky bulk action bar appears with count, action dropdown, and “Apply” CTA.
- Bulk actions show per-agent results in a collapsible status list.

### Mobile Responsiveness
- Control panel collapses into stacked action rows with a bottom-sheet dialog for forms.
- Bulk action bar becomes a floating action button that opens a sheet.
- Destructive confirmations remain accessible without horizontal scrolling.

## 6) Non-functional Requirements
- **Latency:** p95 < 2s from user action to gateway ack; p95 < 4s to final state update.
- **Reliability:** 99.5% command dispatch success for non-destructive actions.
- **Idempotency:** Duplicate requests with same `requestId` do not create conflicting outcomes.
- **Audit Logging:** 100% of control actions stored with operator identity and outcome.
- **Security:** Only authenticated operators can invoke controls; enforce role-based access in Convex.

## 7) Dependencies & Assumptions
- Clawdbot Gateway exposes control methods over WebSocket and returns a structured acknowledgment.
- Bridge can be extended with an authenticated control API endpoint.
- Clerk roles/scopes are available to gate operator access (e.g., `operator.control`).
- Convex actions are permitted to call the bridge endpoint with a shared secret.
- Agent status updates are emitted promptly after control operations.

## 8) Success Metrics
- 90% of control actions are acknowledged within 2 seconds (p95).
- <2% command failure rate excluding intentional rejections.
- 80% reduction in time-to-intervention for paused/restarted agents.
- 100% of control actions appear in audit logs.
- Bulk actions reduce operator time for fleet-wide changes by 50%.

## 9) Out of Scope
- Automated scheduling or policy-driven control decisions.
- Multi-tenant fleet management or external customer access.
- Advanced workflow orchestration beyond single-step control commands.
- Long-term analytics dashboards for control actions.

## 10) Open Questions
1. What are the final gateway method names and payload schemas for control commands?
2. Does the gateway emit a definitive `control.status` event for completion, or only acknowledgments?
3. What is the required maximum batch size for bulk operations?
4. What operator roles/scopes should be enforced for each command type?
5. Should priority overrides apply to sessions, tasks, or both?
6. What is the retention window for control audit logs?
7. Should redirect accept raw task payloads or only references to tasks stored in Convex?
8. What is the expected behavior if an agent is already paused or offline when a command is issued?
