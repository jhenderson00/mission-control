# OpenClaw Integration Testing

## Scope

This suite validates Mission Control → Bridge → OpenClaw command translation and behavior:

- Unit coverage for command normalization and payload parsing
- Integration coverage with a mock Gateway (pause/resume, kill/restart, redirect, priority)
- Bulk operations and audit logging
- Error handling for gateway failures and auth mismatches
- Optional end-to-end test against a live Bridge + OpenClaw Gateway

## Test Files

- `convex/openclaw-integration.test.ts`
- `bridge/src/control-commands.ts` (shared translation utilities)

## Running Tests

Run the full suite:

```
npm run test -- convex/openclaw-integration.test.ts
```

Run all tests (includes coverage):

```
npm run test
```

## End-to-End (Live OpenClaw)

The E2E test is skipped by default. Enable it by setting:

```
export OPENCLAW_E2E=true
export OPENCLAW_BRIDGE_URL=http://localhost:8787/api/control
export OPENCLAW_BRIDGE_SECRET=your-bridge-secret
export OPENCLAW_E2E_AGENT_ID=main
```

Prerequisites:

- The bridge service is running and connected to the OpenClaw Gateway.
- The Gateway is accessible from the bridge host.
- The agent id exists in the Gateway session map.

Then run:

```
npm run test -- convex/openclaw-integration.test.ts
```

## Coverage Notes

- **Pause/Resume cycle:** validates `/stop` and `cron.wake`.
- **Kill/Restart:** validates `/stop`, `/reset`, and `/new`.
- **Redirect:** validates sending task payloads.
- **Priority override:** validates `/queue priority:X`.
- **Bulk operations:** validates multi-agent fan-out and audit logging.
- **Error handling:** validates gateway failures and auth mismatch responses.
