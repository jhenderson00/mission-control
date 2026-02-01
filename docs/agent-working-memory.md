# Agent Working Memory (WORKING.md Pattern)

## Overview
Each agent maintains a local `WORKING.md` file to persist its short-term context:
- Current task being worked on
- Status and progress
- Next steps

On wake, agents read `WORKING.md` to restore context. The bridge syncs this file into Convex for dashboard visibility and collaboration.

## Convex Data Model
### agentWorkingMemory table
Single snapshot per agent, updated on every sync.
- `agentId` (string)
- `currentTask` (string)
- `status` (string)
- `progress` (optional string)
- `nextSteps` (string[])
- `updatedAt` (number, ms)
- `createdAt` (number, ms)

### agentStatus.workingMemory
`agentStatus` includes an optional `workingMemory` snapshot for quick access alongside presence data.

## HTTP Endpoints (Bridge Sync)
All endpoints use `BRIDGE_SECRET` for bearer auth if configured.

### POST /agents/working-memory
Accepts a single payload or array of payloads:
```json
{
  "agentId": "agent_alpha",
  "currentTask": "Implement CYD-127",
  "status": "in-progress",
  "progress": "schema + endpoints done",
  "nextSteps": ["add tests", "write docs"]
}
```

### GET /agents/working-memory
Query parameters:
- `agentId=...` (repeatable)
- `agentIds=a,b,c` (comma-separated)

Returns an array of working memory snapshots.

## Example WORKING.md
```md
# WORKING

Current task: Implement CYD-127 working memory
Status/progress: Upsert + HTTP endpoints done; tests next
Next steps:
- Add Convex tests
- Write docs
```

## Sync Flow
1. Agent updates `WORKING.md` during execution.
2. Bridge reads the file and calls `POST /agents/working-memory`.
3. Dashboard queries `listWorkingMemory` or uses `agentStatus.workingMemory`.
4. On wake, agent reloads `WORKING.md` locally to restore context.
