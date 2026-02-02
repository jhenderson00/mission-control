# Audit Logging Requirements (CYD-117)

## 1) Executive Summary
Audit logs are a primary control for accountability, incident response, and forensic reconstruction of agent control actions. NIST guidance emphasizes that effective log management requires generating, storing, analyzing, and protecting logs, with records kept in sufficient detail for an appropriate period of time and routinely reviewed for incidents and policy violations. Audit records must be protected from unauthorized access or alteration, and time stamps must be reliable and consistent across records (NIST SP 800-92, NIST SP 800-53 AU-8/AU-9). These requirements align with SOC 2 Trust Services Criteria system-operations expectations for detecting anomalies and evaluating security events (AICPA TSC CC7.2/CC7.3).

This document defines what must be logged for agent control actions in Mission Control, how to structure the audit schema, how long to retain records, and the views auditors will expect. It also maps requirements to SOC 2 (CC7.2/CC7.3) and NIST 800-53 AU controls, and provides an implementation roadmap for Friday.

## 2) Audit Events Catalog

### 2.1 Current control actions and data available (codebase snapshot)
Observed in `convex/controls.ts` and PRD:
- Commands: `agent.pause`, `agent.resume`, `agent.redirect`, `agent.kill`, `agent.restart`, `agent.priority.override`.
- Bulk commands: `agent.pause`, `agent.resume`, `agent.priority.override`, `agent.kill`.
- Parameters per command:
  - `agent.pause`: `{ reason? }`
  - `agent.resume`: `{}`
  - `agent.redirect`: `{ taskId? | taskPayload?, priority? }` (requires taskId or taskPayload)
  - `agent.kill`: `{ sessionKey?, force? }`
  - `agent.restart`: `{}`
  - `agent.priority.override`: `{ priority, durationMs? }`
- Operator identity: Clerk `identity.subject` is stored as `requestedBy` and forwarded to the bridge.
- Existing audit writes create `action` values of `control.dispatch` and `control.bulkDispatch` with outcomes `accepted | rejected | error`.

### 2.2 Required audit record content (baseline)
Per NIST AU-3, audit records must identify what happened, when, where, the source, the outcome, and the identities involved. Additionally, time stamps must be generated using system clocks and recorded in UTC (or with offset) (NIST SP 800-53 AU-3/AU-8).

**MUST capture for every audit event:**
- Event identity: `eventId` (unique), `eventType` (see catalog below)
- Time: `eventAt` (UTC or fixed offset), `requestedAt`, `ackedAt`, `completedAt` as applicable
- Actor: `requestedBy` (Clerk user ID), plus an immutable **role snapshot** at time of action (role, permissions, org/tenant)
- Target: `agentId` (and `agentIds` for bulk), `sessionKey` if relevant
- Source context: `sourceSystem` (UI/Convex/Bridge/Gateway), `environment` (prod/stage), and `requestId`/`operationId`/`bulkId`
- Action details: `command`, **sanitized** `params` (avoid secrets; store hashes/refs for large payloads)
- Outcome: `outcome` (`accepted | rejected | error | timed-out | completed`) and `error` details if any

**SHOULD capture (nice-to-have):**
- `requestIp`, `userAgent`, `deviceId` (if available)
- `actorEmail` and `actorDisplayName` (snapshot to avoid future profile changes)
- `previousState` and `newState` (agent status, priority) when known
- `policyDecision` details (see RBAC section)

### 2.3 Audit event types
Use event types that support after-the-fact investigation (NIST SP 800-53 AU-2/AU-3).

**Control Request Lifecycle (per agent):**
- `control.requested` (user initiated, before dispatch)
- `control.dispatched` (bridge request sent)
- `control.acked` (gateway ack received)
- `control.completed` (state change confirmed) or `control.timed_out`
- `control.failed` (bridge error, rejection, or gateway error)

**Authorization/Auditability:**
- `control.authz.allowed` (policy evaluation accepted)
- `control.authz.denied` (policy evaluation denied)
- `control.authz.overridden` (manual override with approver)

**Bulk Operations:**
- `control.bulk.requested` (bulk action initiated)
- `control.bulk.dispatched`
- `control.bulk.summary` (aggregate outcome + per-agent references)

### 2.4 Action-specific minimum fields
The following tables list MUST fields **in addition** to the baseline record content.

| Action | MUST fields | Notes |
|---|---|---|
| `agent.pause` | `agentId`, `reason?`, `requestedAt`, `requestedBy` | Capture reason if supplied; use in UI/audits. |
| `agent.resume` | `agentId`, `requestedAt`, `requestedBy` | No params expected. |
| `agent.redirect` | `agentId`, `taskId` or `taskPayloadRef`, `priority?` | Avoid storing full task payload; store reference or hash. |
| `agent.kill` | `agentId`, `sessionKey?`, `force?` | Destructive action. Consider dual-approval audit event. |
| `agent.restart` | `agentId` | Destructive action. Consider dual-approval audit event. |
| `agent.priority.override` | `agentId`, `priority`, `durationMs?`, `previousPriority?` | Include prior value if known. |
| Bulk (`agents.bulk`) | `bulkId`, `agentIds`, per-agent `operationId` | Create per-agent audit entries + bulk summary. |

## 3) Schema Recommendations

### 3.1 Current schema snapshot (Convex)
- `agentControlOperations` (mutable status): `operationId`, `requestId`, `bulkId?`, `agentId`, `command`, `params?`, `status`, `requestedBy`, `requestedAt`, `ackedAt?`, `completedAt?`, `error?`.
- `agentControlAudits` (append-only): same fields as above + `outcome`.
- `auditLog` (append-only): same fields as `agentControlAudits` + `action` string and indexes for `action`, `requestId`, `operationId`.
- UI reads `auditLog` via `audit.listByAgent`.

### 3.2 Recommended audit log model
**Single append-only audit stream** (recommended to avoid duplication):
- Table: `auditLog` (append-only, no updates/deletes)
- Fields (core):
  - `eventId`, `eventType`, `action`, `command`
  - `requestId`, `operationId`, `bulkId`
  - `agentId`, `agentIds?`, `sessionKey?`
  - `params` (sanitized), `previousState?`, `newState?`
  - `outcome`, `errorCode?`, `errorMessage?`
  - `requestedBy`, `requestedByRole`, `requestedByEmail?`, `requestedByDisplayName?`
  - `policyDecision`, `policyVersion`, `policyReason?`
  - `sourceSystem`, `environment`, `requestIp?`, `userAgent?`
  - `requestedAt`, `ackedAt?`, `completedAt?`, `eventAt`

**Immutability & integrity**
- Append-only writes; never patch/delete audit entries.
- Protect audit information from unauthorized access, modification, or deletion. Consider cryptographic integrity (hash chains or signatures) and WORM-style storage for archived logs (NIST SP 800-53 AU-9).

### 3.3 Indexes (minimum)
- `by_agent` (agentId, requestedAt)
- `by_requested_by` (requestedBy, requestedAt)
- `by_action` (action, requestedAt)
- `by_event_type` (eventType, eventAt)
- `by_operation` (operationId)
- `by_request` (requestId)
- `by_bulk` (bulkId, requestedAt)
- `by_outcome` (outcome, requestedAt)

These align with AU-2 (selected event types) and AU-3 (content of audit records).

## 4) Retention Policy

### 4.1 Policy requirements
- NIST AU-11 requires audit records be retained for an organization-defined period consistent with retention policy to support investigations and regulatory requirements (NIST SP 800-53 AU-11).
- NIST log management guidance emphasizes keeping records in sufficient detail for an appropriate period and routinely analyzing logs for incidents and policy violations (NIST SP 800-92).

### 4.2 Recommended baseline (risk-based)
- **Minimum**: 12 months retained, with last 90 days immediately available online. This mirrors PCI DSS 4.0 requirement 10.5.1 and is a common benchmark (use only if relevant to regulated environments).
- **Preferred (SOC 2 readiness)**: 18-24 months total retention for investigations and audit lookback; first 90-180 days in hot storage; remainder archived with integrity controls.
- **Document exceptions**: data minimization or contractual constraints must be documented with risk acceptance.

## 5) Query Requirements
Auditors typically request filtered, exportable views with consistent time ordering.

**Required filters/views:**
- Per-agent audit timeline (newest-first)
- Per-operator activity view (who did what, when)
- By action type and outcome (accepted/rejected/error/timed-out)
- By bulkId, requestId, operationId for correlation
- Time-range query for incident windows
- Exportable CSV/JSON snapshot for audit evidence

These support AU-2/AU-3 requirements for after-the-fact investigations and audit review.

## 6) Implementation Roadmap (for Friday)
1. **Confirm taxonomy**: finalize event types and naming (requested/acked/completed/failed/authz).
2. **Schema consolidation**: decide whether to merge `agentControlAudits` into `auditLog` or formalize a single append-only stream.
3. **Field expansion**: add role snapshot + policy decision fields and source context (environment, system).
4. **Sanitization rules**: define redaction/ hashing for `params`, especially task payloads.
5. **Immutability controls**: block updates/deletes; add integrity hashes if feasible.
6. **Retention & archival**: implement retention policy with hot/cold storage split.
7. **Queries & exports**: add query endpoints and export paths for audit review.
8. **Validation & tests**: unit tests for audit event writes per control action and authz outcomes.

## 7) Compliance Checklist (SOC 2 + NIST alignment)

### SOC 2 (Trust Services Criteria - System Operations)
- CC7.2: Monitor system components for anomalies; analyze anomalies as security events.
- CC7.3: Evaluate security events as incidents and take actions to prevent/address failures.
- Evidence: audit log entries for detection, ack/complete outcomes, and incident tagging.

### NIST SP 800-53 (Audit & Accountability)
- AU-2 Event Logging: identify, select, and review event types to log.
- AU-3 Content of Audit Records: include event type, time, location/source, outcome, and identities.
- AU-8 Time Stamps: use internal clocks and record UTC or UTC-offset time stamps.
- AU-9 Protection of Audit Information: protect logs from unauthorized access/modification/deletion; alert on tampering.
- AU-11 Audit Record Retention: retain logs per policy to support investigations and regulatory requirements.

### NIST SP 800-92 (Log Management)
- Log management includes generating, storing, analyzing, and disposing logs; records should be kept for an appropriate period.
- Routine log analysis helps detect incidents, policy violations, and operational problems.
- Log confidentiality, integrity, and availability must be protected.

---

Prepared by: Rook (Compliance Specialist)
