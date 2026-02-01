# Multi-Agent Architecture (CYD-130)

## Purpose
Design the multi-agent architecture for Mission Control with a coordinator (Cydni) and specialist agents (Scout, Quill). This document defines hierarchy, roles, capabilities, communication protocol, and delegation patterns. It is a design-only artifact; no implementation changes are made here.

## Inputs Reviewed
- Current Convex agent schema and queries (`convex/schema.ts`, `convex/agents.ts`).
- CYD-97 Agent Controls PRD (control operations, pending ops, audit trail).
- CYD-107 WebSocket Protocol Spec (gateway events, presence, bridge flow).
- OpenClaw Integration Plan (command translation, session mapping, pause semantics).

## Missing Reference
CYD-130 issue details are not present in the repo. Requirements below are derived from existing specs and the mission brief. If CYD-130 includes additional constraints (e.g., SLAs, specific roles, or tool permissions), this design should be updated.

---

## Architecture Overview

### Hierarchy
```
Cydni (Coordinator)
  ├─ Scout agents (Monitoring / Detection)
  └─ Quill agents (Documentation / Summaries)
```

### Intent
- **Cydni** is the single coordinator and policy owner. It delegates monitoring and documentation tasks, resolves conflicts, and maintains the authoritative task and decision state.
- **Scouts** observe systems, detect anomalies, and report signals and alerts.
- **Quills** consolidate information, produce structured documentation, and ensure audit-friendly narratives.

### Alignment to Existing Types
Current `agents.type` includes `coordinator`, `planner`, `executor`, `critic`, `specialist`. This design maps:
- **Cydni** -> `coordinator`
- **Scout** -> `specialist`
- **Quill** -> `specialist`

A new explicit `role` field is recommended to distinguish specialist subtypes without reworking `type`.

---

## Agent Profiles

### 1) Cydni (Coordinator)
**Primary responsibilities**
- Global prioritization and routing of tasks.
- Delegation to Scouts/Quills with clear success criteria.
- Conflict resolution and final decision logging.
- Ensuring coverage of monitoring and documentation workflows.

**Capabilities**
- Task orchestration (assign, reassign, cancel).
- Policy enforcement (escalation thresholds, SLAs).
- Decision tracking and summary output.

**Default cadence**
- Reviews Scout signals on a rolling basis.
- Requests Quill updates per task completion or major event.

### 2) Scout (Monitoring Specialist)
**Primary responsibilities**
- Monitor selected surfaces (gateway events, status feeds, task failures, health signals).
- Detect anomalies and trigger alerts with severity and confidence.
- Produce structured “signal packets” for Cydni.

**Capabilities**
- Subscribe to presence/health/heartbeat events.
- Analyze deltas, detect regressions, and compare to baselines.
- Propose next actions (pause, restart, escalate, investigate).

**Output format**
- Short signal packets: `signalId`, `severity`, `summary`, `evidence`, `recommendedAction`, `confidence`.

### 3) Quill (Documentation Specialist)
**Primary responsibilities**
- Maintain task narratives, incident summaries, and decision logs.
- Generate artifacts from agent and event streams.
- Produce digestible outputs for humans and audit logs.

**Capabilities**
- Summarize tasks, decisions, and events into structured docs.
- Convert raw logs into polished summaries.
- Maintain “source of truth” documents linked to tasks.

**Output format**
- Structured doc packets: `docId`, `title`, `summary`, `sources`, `openQuestions`, `recommendations`.

---

## Schema Design (Proposed)

### A) Agents Table Extensions
Add fields to clarify role, capabilities, and hierarchy without changing the existing `type` enum.

**Proposed fields**
- `role`: `coordinator | scout | quill | other` (string union)
- `capabilities`: array of strings (e.g., `monitoring.presence`, `docs.summary`, `controls.dispatch`)
- `supervisorAgentId`: optional `Id<"agents">` (Cydni for Scouts/Quills)
- `teamId`: optional string (future grouping)
- `availability`: optional object `{ timezone?, hours?, maxConcurrentTasks? }`

**Rationale**
- Keeps existing `type` stable for system-wide usage.
- Enables specialist differentiation and capability-based routing.

### B) Agent Relationship Table (Optional)
If future org structures include multi-level hierarchies or squads, add a relationship table for flexibility.

**Proposed table**: `agentRelationships`
- `parentAgentId`, `childAgentId`
- `relationship`: `supervises | collaborates | mentors`
- `createdAt`

### C) Task Extensions (Delegation Metadata)
**Proposed fields**
- `delegatedByAgentId`: optional `Id<"agents">`
- `delegationReason`: optional string
- `requestedByRole`: optional string (who initiated: coordinator/scout/quill/operator)
- `expectedOutput`: optional string (doc, signal, fix, analysis)
- `slaMinutes`: optional number

### D) Communication / Message Table (Optional)
Events are already stored, but a materialized message table can help UI and delegation tracking.

**Proposed table**: `agentMessages`
- `messageId` (string)
- `fromAgentId`, `toAgentId`
- `threadId` (task or conversation)
- `messageType`: `directive | signal | report | question | ack`
- `payload` (object)
- `createdAt`

---

## Communication Protocol Design

### Channels
- **Gateway Events**: Raw stream via bridge (presence, heartbeat, agent events).
- **Convex**: Source of truth for tasks, status, decisions, and materialized messages.
- **Task Threads**: Logical channels tied to task IDs for delegation.

### Message Types
1. **Directive** (Coordinator -> Specialist)
   - Purpose: Assign or update task.
   - Fields: `directiveId`, `taskId`, `priority`, `successCriteria`, `deadline`, `contextLinks`.

2. **Signal** (Scout -> Coordinator)
   - Purpose: Alert or anomaly detection.
   - Fields: `signalId`, `severity`, `summary`, `evidence`, `recommendation`, `confidence`.

3. **Report** (Specialist -> Coordinator)
   - Purpose: Task completion or partial result.
   - Fields: `reportId`, `taskId`, `status`, `output`, `risks`, `followups`.

4. **Question / Clarification** (Specialist -> Coordinator)
   - Purpose: Resolve ambiguity.
   - Fields: `questionId`, `taskId`, `blockingReason`, `options`.

5. **Ack / Receipt** (Any -> Any)
   - Purpose: Confirm receipt or acceptance of a directive.
   - Fields: `messageId`, `accepted`, `reason?`.

### Reliability and Idempotency
- Each message includes `messageId` and optional `requestId`.
- Coordinator treats signals and reports as idempotent: de-dupe by `messageId`.
- For directives, store `directiveId` and current status: `sent`, `acked`, `in_progress`, `done`, `failed`.

---

## Delegation & Coordination Patterns

### 1) Standard Task Delegation
1. Cydni creates a task with explicit success criteria.
2. Task is assigned to Scout or Quill (or both).
3. Specialist acknowledges within SLA (default 5 minutes).
4. Specialist delivers report or requests clarification.
5. Cydni updates task status and logs decision.

### 2) Monitoring Loop (Scout)
- Scouts subscribe to presence/health/heartbeat events.
- On anomaly, Scout sends a **Signal** with severity and recommendation.
- Cydni decides whether to dispatch control commands or open investigation tasks.

### 3) Documentation Loop (Quill)
- Quills subscribe to task completion and decision changes.
- For every completed or escalated task, Quill writes a brief summary + open questions.
- Cydni confirms and publishes summaries to docs.

### 4) Escalation Rules
- **Severity High/Critical** signals auto-create a task assigned to Cydni + Scout.
- **Repeated failures** (same task failing twice) triggers a Quill summary.
- **Blocked > SLA** triggers Cydni intervention or task re-assignment.

### 5) Conflict Resolution
- Cydni is the final authority for task priority and acceptance.
- Specialists may propose alternatives, but Cydni closes the loop.

---

## Capabilities Catalog (Initial)

### Coordinator (Cydni)
- `tasks.create`, `tasks.assign`, `tasks.reassign`, `tasks.close`
- `controls.dispatch`, `controls.bulk`
- `decisions.record`, `audit.read`

### Scout
- `monitoring.presence`, `monitoring.health`, `monitoring.events`
- `signals.emit`, `alerts.escalate`

### Quill
- `docs.summary`, `docs.decision-log`, `docs.incident-report`
- `reports.publish`, `reports.revise`

---

## Open Questions (CYD-130)
1. Are Scout and Quill single instances or fleets (N agents) per role?
2. What SLA targets apply to detection vs documentation tasks?
3. Do we need explicit approval gates before control actions are dispatched?
4. Should specialist outputs be stored as `task.output`, a dedicated table, or both?
5. What retention policy applies to messages and reports?

---

## Next Steps (Design Only)
- Confirm CYD-130 requirements and update role/capability list.
- Align schema changes with Convex team conventions before implementation.
- Validate message types with Bridge/Gateway event constraints.

