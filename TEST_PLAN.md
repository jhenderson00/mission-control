# OpenClaw Integration Test Plan (CYD-124)

## 1) Executive Summary
Mission Control's OpenClaw integration spans Convex actions, the Bridge control endpoint, the OpenClaw Gateway WebSocket client, and the UI's real-time views. This plan focuses on validating end-to-end control command dispatch (pause/resume/redirect/kill/restart/priority), status syncing, audit logging, and event ingestion with resilience to failures and reconnects. The goal is to ensure operator commands are translated correctly, reliably reach OpenClaw, and produce consistent state and UI updates.

## 2) Integration Points Map
- **Mission Control UI -> Convex**: `controls.dispatch` / `controls.bulkDispatch` actions from UI (optimistic updates + audit views).
- **Convex -> Bridge**: HTTP `POST /api/control` with auth (`BRIDGE_CONTROL_SECRET` or `BRIDGE_SECRET`).
- **Bridge -> OpenClaw Gateway**: WebSocket `send` / `call` methods and `connect` handshake.
- **Gateway -> Bridge**: WebSocket event stream (`agent`, `chat`, `presence`, `health`, `heartbeat`).
- **Bridge -> Convex**: HTTP actions `events/ingest`, `agents/update-status`, `agents/sync` with auth (`BRIDGE_SECRET`).
- **Convex -> UI**: Subscriptions/queries drive agent status, activity feed, and audit log updates.

## 3) Test Infrastructure
- **Test runner:** Vitest (`npm run test`) with coverage thresholds at 80% for lines/functions/statements/branches.
- **Environments:**
  - Default `jsdom` (React/UI).
  - `@vitest-environment node` for Bridge and Gateway tests (see `bridge/src/*.test.ts`).
- **React testing:** `@testing-library/react` + `user-event`.
- **Convex test utilities:** `src/test/convex-test-utils.ts` provides `createMockCtx`, `asHandler`, `asHttpAction` for actions/queries/httpAction testing with an in-memory DB.
- **Mocking patterns:**
  - `vi.mock()` for module isolation (e.g., `convex/react`, `next/navigation`).
  - `vi.stubGlobal("fetch", ...)` for Bridge/Convex HTTP calls.
  - `vi.useFakeTimers()` for timestamp-sensitive flows.
- **Existing reference tests:**
  - `convex/openclaw-integration.test.ts` (command translation + mock gateway + optional E2E).
  - `convex/controls.test.ts` (dispatch/bulkDispatch workflows + audits).
  - `convex/events.test.ts`, `convex/agents.test.ts` (HTTP actions + payload validation).
  - `bridge/src/diagnostics.test.ts`, `bridge/src/subscriptions.test.ts` (bridge helpers).
- **E2E toggle:** `OPENCLAW_E2E`, `OPENCLAW_BRIDGE_URL`, `OPENCLAW_BRIDGE_SECRET`, `OPENCLAW_E2E_AGENT_ID` (see `docs/openclaw-integration-testing.md`).

## 4) Test Categories
1. **Unit Tests**
   - Command normalization and payload parsing.
   - Gateway action construction and session key resolution.
   - Presence payload parsing and derived event construction.
2. **Integration Tests (Mocked IO)**
   - Convex `controls.dispatch` / `bulkDispatch` -> Bridge `/api/control` -> Gateway actions.
   - Bridge Gateway event handling -> Convex `events.ingest`, `agents.update-status`, `agents.sync`.
   - Audit logging and operation state transitions across systems.
3. **End-to-End (Live Bridge + Gateway)**
   - One or two smoke paths to confirm real wiring, kept opt-in and gated by env.

## 5) Test Cases Catalog

### A. Command Translation & Payload Parsing (Unit)
- **CT-01** Normalize command aliases (e.g., `agent.pause`, `priority.override`) to canonical commands.
- **CT-02** Parse single-agent payloads with `agentId`, `command`, `params`, `requestId`.
- **CT-03** Parse bulk payloads with `agentIds`.
- **CT-04** Parse legacy `agents.bulk` payloads (nested `command`, `agentIds`).
- **CT-05** Resolve session keys (default `agent:{id}:main`, override via `params.sessionKey`).
- **CT-06** Build Gateway actions for each command:
  - pause -> `/stop`
  - resume -> `cron.wake`
  - redirect -> message payload
  - kill -> `/stop` + `/reset`
  - restart -> `/new`
  - priority -> `/queue priority:X`
- **CT-07** Reject missing redirect payloads or priority values.

### B. Convex Controls Actions (Integration with Mock Bridge)
- **CV-01** `controls.dispatch` success path: queued -> sent -> acked, audit + auditLog written.
- **CV-02** Bridge agent ID mapping (`agents.bridgeAgentId`) used for dispatch payloads.
- **CV-03** Rejected ack sets operation `failed`, audit outcome `rejected`.
- **CV-04** Error ack sets operation `failed`, audit outcome `error`.
- **CV-05** Bridge down / fetch error: operations fail, audits written, error message propagated.
- **CV-06** Idempotent operations: repeated requestId returns existing operation status.
- **CV-07** Bulk dispatch success: operations for each agent created, acked, audits recorded.
- **CV-08** Bulk dispatch failure: all new operations fail, audits recorded with error.
- **CV-09** Auth failures from Bridge (401) surface correct error in results.

### C. Bridge Control Endpoint (Integration with Mock Gateway)
- **BR-01** `POST /api/control` rejects missing/invalid auth (401).
- **BR-02** `POST /api/control` rejects invalid JSON (400).
- **BR-03** `POST /api/control` rejects invalid payloads (400) including missing agentId/agentIds.
- **BR-04** Payload too large returns 413.
- **BR-05** Single-agent control generates expected Gateway actions.
- **BR-06** Bulk control executes per agent; ack `accepted` when all succeed.
- **BR-07** Gateway error returns ack `{ status: "error", error }`.
- **BR-08** Validation error returns ack `{ status: "rejected", error }`.
- **BR-09** Pause/resume/redirect/restart update manual status via `agents/update-status`.

### D. Gateway Client & Reconnection (Integration / Unit)
- **GW-01** Connect + authenticate handshake (`connect` request and `hello-ok`).
- **GW-02** Request timeout surfaces error (`Gateway request timeout`).
- **GW-03** Reconnect after disconnect, respects max attempts / intervals.
- **GW-04** Health check call returns response and updates connection state.
- **GW-05** Presence payload parsing yields normalized snapshot entries.

### E. Event Flow: Gateway -> Bridge -> Convex -> UI
- **EV-01** Gateway `agent` event emits base event plus derived events (`tool_call`, `tool_result`, `thinking`, `error`, `token_usage`, diagnostics).
- **EV-02** Presence snapshot updates agent status (online/busy/paused/offline) and sessionInfo.
- **EV-03** Health snapshot updates agent metadata + status via `agents/sync` and `agents/update-status`.
- **EV-04** Buffer flush posts event batch to Convex `events/ingest` with auth header.
- **EV-05** Ingest failure requeues batch; next flush retries.
- **EV-06** Event gap detection triggers `initialSync` and re-hydrates presence/health.
- **EV-07** Busy window logic marks active agents as `busy` when recent activity exists.

### F. UI Validation (Integration / UAT)
- **UI-01** Control actions update optimistic operations, status badges, and errors (`ControlPanel`, `PendingOperations`).
- **UI-02** Agent status updates (online/busy/paused/offline) propagate to status grid and header.
- **UI-03** Audit log entries render with correct outcome and timestamps after control actions.
- **UI-04** Real-time event streams display in activity feed / conversation view.

### G. End-to-End (Live OpenClaw)
- **E2E-01** Pause command flows through Convex -> Bridge -> Gateway, returns `accepted`.
- **E2E-02** Optional: redirect command sends task payload to live session.
- **E2E-03** Optional: bulk pause for 2 agents (if multiple sessions available).

## 6) Mock Requirements
- **Mock Gateway (HTTP + WS):**
  - For `/api/control` tests, a mock gateway executor capturing `send`/`call` invocations.
  - For Gateway client tests, a `ws` server that can emit `hello-ok`, `event`, and presence snapshots; support error/timeout simulation.
- **Mock Bridge Server:**
  - Local HTTP server to emulate `/api/control` responses (accepted/rejected/error) for Convex action tests.
- **Mock Convex HTTP endpoints:**
  - Local HTTP server to verify Bridge posts to `/events/ingest`, `/agents/update-status`, `/agents/sync` with auth headers.
- **Mock Convex context:**
  - Use `createMockCtx` with seeded `agents`, `agentControlOperations`, `agentControlAudits`, `auditLog`, and `events` fixtures.
- **Time control:**
  - `vi.useFakeTimers()` for presence/heartbeat and activity window logic.

## 7) Implementation Roadmap (Ordered for Friday)
1. **Extend** `convex/openclaw-integration.test.ts` to cover:
   - Manual status updates for pause/resume/redirect/restart.
   - Additional error cases (payload too large, invalid payloads).
2. **Add** `bridge/src/control-endpoint.test.ts` (node env):
   - `/api/control` auth/payload validation, bulk handling, gateway errors.
3. **Add** `bridge/src/gateway-client.test.ts` (node env):
   - connect/auth handshake, request timeout, reconnect behavior.
4. **Add** `bridge/src/event-flow.test.ts` (node env):
   - Derived events, buffer flush + retry, presence/health updates -> Convex client calls.
5. **Add/Extend** UI tests under `src/__tests__/`:
   - Agent status + audit log rendering tied to control actions and status updates.
6. **Optional E2E**: Extend `convex/openclaw-integration.test.ts` gated by `OPENCLAW_E2E` env.

## 8) Coverage Goals
- **Global:** Maintain existing 80%+ thresholds (lines/functions/statements/branches).
- **Critical paths:**
  - 90%+ for command translation and control endpoint handling.
  - 85%+ for Convex control actions (dispatch/bulkDispatch) and audit logging.
  - 80%+ for Bridge event ingestion and status sync logic.
- **E2E:** At least one live control command path validated when OpenClaw is available.
