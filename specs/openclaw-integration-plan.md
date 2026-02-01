# OpenClaw Integration Plan for Mission Control Phase 3

**Date:** 2026-01-31
**Author:** Cydni
**Status:** Draft

---

## Executive Summary

Mission Control Phase 3 built UI components for agent controls (pause, resume, redirect, kill, restart, priority override, bulk operations, audit log). However, the backend integration with OpenClaw's actual control mechanisms needs to be designed and implemented.

After researching OpenClaw docs (docs.openclaw.ai), this plan outlines how to connect Mission Control's Convex backend to OpenClaw's Gateway API.

---

## Current State

### What's Built (Phase 3 UI)
- ✅ Control Panel with all action buttons
- ✅ Confirmation dialogs for destructive actions
- ✅ Bulk action bar with multi-select
- ✅ Pending operations display
- ✅ Audit log display
- ✅ Convex schema for operations and audits

### What's Missing
- ❌ Bridge → OpenClaw Gateway connection
- ❌ Mapping control commands to OpenClaw primitives
- ❌ Real-time agent status sync
- ❌ Actual command dispatch implementation

---

## OpenClaw Capabilities (Discovered)

### Available Gateway Methods
| Method | Purpose |
|--------|---------|
| `health` | Full health snapshot |
| `status` | Short summary |
| `sessions.list` | List active sessions |
| `system-presence` | Current presence list |
| `send` | Send message via channel |
| `agent` | Run an agent turn |
| `node.*` | Node control (paired devices) |
| `cron.*` | Scheduled jobs |
| `config.*` | Configuration management |

### Available Slash Commands (sent as messages)
| Command | Effect |
|---------|--------|
| `/stop` | Abort current run, clear queued followups |
| `/restart` | Restart the gateway (if enabled) |
| `/reset`, `/new` | Start fresh session |
| `/compact` | Summarize older context |
| `/model` | Change model |
| `/queue` | Queue settings |

### What OpenClaw Does NOT Have
- No direct `agent.pause` / `agent.resume` RPC methods
- No built-in "fleet control" or multi-agent orchestration
- No priority queue exposed at agent level

---

## Integration Strategy

### Option A: Command Translation (Recommended)

Map Mission Control commands to OpenClaw primitives:

| MC Command | OpenClaw Equivalent | Implementation |
|------------|---------------------|----------------|
| **Pause** | Send `/stop` to session | `sessions_send` with `/stop` message |
| **Resume** | Send wake message | `cron.wake` or `sessions_send` |
| **Redirect** | Send task as message | `sessions_send` with new task prompt |
| **Kill** | Session reset + stop | `/stop` then delete session or `/reset` |
| **Restart** | `/new` to session | `sessions_send` with `/new` |
| **Priority** | Queue settings | `/queue priority:high` or config patch |

### How It Works

```
Mission Control UI
       ↓
Convex Action (controls.dispatch)
       ↓
Bridge HTTP Endpoint (/api/control)
       ↓
OpenClaw Gateway WebSocket
       ↓
Target Session
```

### Bridge Implementation

The existing `mission-control-bridge` needs:

1. **OpenClaw Gateway Client**
   - Connect to `ws://127.0.0.1:18789` (or configured URL)
   - Authenticate with gateway token
   - Handle reconnection

2. **Control Endpoint** (`/api/control`)
   ```typescript
   POST /api/control
   {
     agentId: string,
     command: "pause" | "resume" | "redirect" | "kill" | "restart" | "priority",
     params?: { taskId?, priority?, reason? },
     requestId: string
   }
   ```

3. **Command Translation**
   ```typescript
   async function executeControl(cmd: ControlCommand) {
     const sessionKey = `agent:${cmd.agentId}:main`;
     
     switch (cmd.command) {
       case "pause":
         // Send /stop to abort current work
         await gateway.call("send", {
           sessionKey,
           message: "/stop"
         });
         break;
         
       case "resume":
         // Wake the session with optional message
         await gateway.call("cron.wake", {
           text: cmd.params?.message || "Resume work",
           mode: "now"
         });
         break;
         
       case "redirect":
         // Send new task as message
         await gateway.call("send", {
           sessionKey,
           message: cmd.params?.taskPayload
         });
         break;
         
       case "kill":
         // Stop then reset
         await gateway.call("send", { sessionKey, message: "/stop" });
         await gateway.call("send", { sessionKey, message: "/reset" });
         break;
         
       case "restart":
         await gateway.call("send", { sessionKey, message: "/new" });
         break;
         
       case "priority":
         // Queue priority override
         await gateway.call("send", {
           sessionKey,
           message: `/queue priority:${cmd.params?.priority}`
         });
         break;
     }
     
     return { status: "accepted", requestId: cmd.requestId };
   }
   ```

---

## Implementation Tasks

### Phase 3.1: Gateway Client (Bridge)
- [ ] Add OpenClaw WebSocket client to bridge
- [ ] Implement `connect` handshake with auth
- [ ] Handle reconnection and error recovery
- [ ] Add health check endpoint

### Phase 3.2: Control Translation
- [ ] Implement command translation layer
- [ ] Map MC commands → OpenClaw primitives
- [ ] Handle command acknowledgments
- [ ] Return operation status to Convex

### Phase 3.3: Status Sync
- [ ] Subscribe to `presence` events from Gateway
- [ ] Map presence → agent status updates
- [ ] Push status changes to Convex
- [ ] Handle session lifecycle events

### Phase 3.4: Testing
- [ ] Unit tests for command translation
- [ ] Integration tests with mock Gateway
- [ ] End-to-end test with real OpenClaw

---

## Configuration Required

### Bridge Config (bridge/.env)
```
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=<same-token-as-gateway>
```

**Auth Decision:** Use the same gateway token. The bridge runs on the same host and is a trusted internal service. No need for a separate service token.

### Convex Environment
```
BRIDGE_CONTROL_URL=http://localhost:3001/api/control
BRIDGE_AUTH_SECRET=<shared-secret>
```

---

## Alternative Approaches Considered

### Option B: OpenClaw Plugin
Build a dedicated "mission-control" OpenClaw plugin that exposes control methods. 

**Pros:** Clean separation, native OpenClaw integration
**Cons:** More development, requires OpenClaw plugin knowledge

### Option C: Direct CLI Calls
Have the bridge exec `openclaw` CLI commands.

**Pros:** Simple, uses existing CLI
**Cons:** Slow (process spawn), less reliable, no streaming

---

## Questions — RESOLVED

### 1. Session Key Mapping ✅
**Format:** `agent:{agentId}:main` for main DM sessions.

Verified from OpenClaw config:
- `agent:main:main` — main DM session
- `agent:main:telegram:group:-XXXXX:topic:Y` — group topics

**Implementation:** Use `agent:${agentId}:main` as the session key target.

### 2. Real-time Status ✅
**Decision:** Track paused state in Convex only.

Rationale:
- OpenClaw presence shows connected clients, not agent work state
- "Paused" is a Mission Control UI concept
- When we send `/stop`, mark agent as paused in Convex
- When we send resume message, clear paused flag

**Implementation:** Add `isPaused: boolean` to Convex agents schema.

### 3. Bulk Operations ✅
**Decision:** Loop with parallelization, no rate limiting initially.

Rationale:
- Fleet size expected to be small (<20 agents initially)
- OpenClaw Gateway handles concurrent requests well
- Can add rate limiting later if needed

**Implementation:** Use `Promise.all()` with reasonable concurrency (5-10).

### 4. Priority Override ✅
**Decision:** Use `/queue priority:X` as the mechanism.

Rationale:
- Queue priority is sufficient for initial use case
- Maps to OpenClaw's native queue command
- Can enhance later with custom scheduling if needed

**Implementation:** Translate MC priority levels to queue priority values.

---

## Success Criteria

1. ✅ Pause/Resume commands successfully stop/restart agent work
2. ✅ Kill/Restart properly reset agent sessions
3. ✅ Redirect sends new tasks to agents
4. ✅ Operations are tracked with pending/acked/failed states
5. ✅ Audit log captures all control actions with timestamps
6. ✅ UI reflects real-time agent status changes

---

## Next Steps

1. **Review this plan** with Josh
2. **Prototype Gateway client** in bridge
3. **Test command translation** with live OpenClaw
4. **Iterate** based on real behavior

---

*This plan is based on OpenClaw docs as of 2026-01-31. Gateway API may have additional undocumented methods.*
