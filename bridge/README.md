# Mission Control Bridge

This service connects to the Clawdbot Gateway WebSocket, buffers events, and
pushes batched payloads into Convex via the HTTP ingest action.

## Requirements

- Node.js 18+
- Access to Clawdbot Gateway (WebSocket)
- Convex deployment URL and bridge secret

## Configuration

Create an `.env` file (or export variables) with:

```env
# Gateway connection
GATEWAY_URL=ws://localhost:18789
GATEWAY_TOKEN=your-gateway-token

# Convex connection
CONVEX_URL=https://<deployment>.convex.cloud
CONVEX_ACTION_SECRET=your-bridge-secret

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

## Notes

- On reconnect, the bridge fetches `system-presence`, `sessions.list`, and
  `chat.history` to resync state.
- Event batches flush every 100ms or 10 events (configurable).
