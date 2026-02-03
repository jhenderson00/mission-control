# Mission Control Bridge

This service connects to the OpenClaw Gateway WebSocket, buffers events, and
pushes batched payloads into Convex via the HTTP ingest action.

## Requirements

- Node.js 18+
- Access to OpenClaw Gateway (WebSocket)
- Convex deployment URL and bridge secret

## Configuration

Create an `.env` file (or export variables) with:

```env
# Gateway connection (preferred)
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=your-gateway-token

# Legacy env names (still supported)
GATEWAY_URL=ws://127.0.0.1:18789
GATEWAY_TOKEN=your-gateway-token

# Convex connection
CONVEX_URL=https://<deployment>.convex.cloud
CONVEX_ACTION_SECRET=your-bridge-secret

# Control endpoint auth (optional)
BRIDGE_CONTROL_SECRET=your-control-secret
# Or use BRIDGE_AUTH_SECRET for Convex callers
BRIDGE_AUTH_SECRET=your-control-secret

# Control endpoint port (default: 3001)
BRIDGE_CONTROL_PORT=3001

# Optional tuning (set MAX_RECONNECT_ATTEMPTS=0 for unlimited retries)
RECONNECT_INTERVAL_MS=5000
MAX_RECONNECT_ATTEMPTS=10
EVENT_BATCH_SIZE=10
EVENT_BATCH_INTERVAL_MS=100
REQUEST_TIMEOUT_MS=10000

# Optional: agentId normalization (JSON or from=to pairs)
BRIDGE_AGENT_ID_ALIASES={"cydni-main":"main"}
```

The Convex HTTP action is registered at:

```
https://<deployment>.convex.cloud/api/http/events/ingest
```

Set the same value in Convex as `BRIDGE_SECRET` to authorize requests.

## Development

```bash
npm install
npm run build
npm run start
```

## Health Check

The bridge exposes a health endpoint on the control port:

```
GET /api/health
GET /health
```

If `BRIDGE_CONTROL_SECRET` (or `BRIDGE_AUTH_SECRET`) is configured, include it
as a bearer token to retrieve a live gateway health snapshot.

## Notes

- On reconnect, the bridge fetches `system-presence`, `sessions.list`, and
  `chat.history` to resync state.
- Event batches flush every 100ms or 10 events (configurable).
