# Notification Daemon (CYD-125)

## Overview
The notification daemon polls Convex for undelivered @mention notifications and delivers them to agent sessions via the OpenClaw Gateway. It only sends when an agent session is online. If an agent is asleep/offline, the notification stays queued until the next presence heartbeat.

## How It Works
1. `taskComments.addComment` parses @mentions and inserts notification records for agent mentions.
2. The daemon polls `/notifications/pending` every 2 seconds (default).
3. If the target agent is online (presence snapshot), the daemon sends the message via `gateway.send`.
4. On success, the daemon marks the notification as delivered in Convex.
5. On failure, the daemon records the attempt and retries after a backoff.

## Configuration
Set these environment variables (via `.env` in `bridge/` or export them):

```
# OpenClaw Gateway
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=your-gateway-token

# Convex HTTP endpoint + auth
CONVEX_URL=https://<deployment>.convex.cloud
CONVEX_ACTION_SECRET=your-bridge-secret

# Convex environment should set BRIDGE_SECRET to the same value as CONVEX_ACTION_SECRET
BRIDGE_SECRET=your-bridge-secret

# Optional override for notification HTTP auth (daemon will use this if set)
NOTIFICATION_DAEMON_SECRET=your-notification-secret

# Optional tuning
NOTIFICATION_POLL_INTERVAL_MS=2000
NOTIFICATION_BATCH_SIZE=25
NOTIFICATION_RETRY_BACKOFF_MS=5000
NOTIFICATION_AGENT_ID_ALIASES={"cydni-main":"main"}
```

## Run Locally
```
cd bridge
npm install
npm run build
npm run start:notifications
```

## Notes
- The daemon uses presence snapshots from the OpenClaw Gateway to decide if an agent is online.
- Delivery failures are recorded in the `notifications` table (`attempts`, `lastAttemptAt`, `lastError`).
- Notifications remain `pending` until successfully delivered.
