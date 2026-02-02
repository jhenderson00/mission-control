# CYD-145: Fix Dashboard Agent Visibility

## Problem
Agent lifecycle data is written to Convex (`agentStatus` table) but the dashboard UI doesn't display live agent activity. Agent cards show stale or no status.

## Root Cause
The `agentStatus.agentId` field may contain bridge agent IDs (like "scout") instead of Convex document IDs, causing a mismatch when the UI looks up status by `agent._id`.

## Debug First
Before making changes, add console.log statements to understand the data:

1. In `src/components/agents/agent-status-grid.tsx`:
   - Log `agentIds` being passed to `useAgentStatus`
   - Log `statusByAgent` map contents
   - Log what `statusByAgent.get(agent._id)` returns for each agent

2. Check the Convex data directly:
   - What does `listStatus` return?
   - What are the actual `agentId` values in `agentStatus` table?

## Key Files

### Backend
- `convex/agents.ts` - Contains `listStatus` query that returns agent status data
  - The query maps `bridgeAgentId` to Convex IDs - verify this works
  - Check the `bridgeToConvex` mapping logic

### Frontend
- `src/lib/realtime/use-agent-status.ts` - Hook that fetches live status
- `src/components/agents/agent-status-grid.tsx` - Grid component that displays agents
  - Uses `useAgentStatus({ agentIds })` to get live data
  - Passes `statusByAgent.get(agent._id)?.status` as `heartbeatStatus`

### Main Dashboard
- `src/app/(dashboard)/page.tsx` - Main dashboard page
  - Uses `useQuery(api.agents.listWithTasks)` to get agents
  - Passes agents to `AgentStatusGrid`

## Tasks

### 1. Fix ID Mapping
The `listStatus` query in `convex/agents.ts` has logic to map `bridgeAgentId` to Convex IDs. Verify it works:
- When `agentStatus.agentId` is "scout", it should be mapped to Scout's Convex `_id`
- The response should use Convex IDs so the UI can look them up

### 2. Update Agent Cards to Show Working Memory
In `agent-status-grid.tsx`, the `AgentCard` component should display:
- Current task from `workingMemory.currentTask`
- Status from `workingMemory.status`
- Time since last activity

Update the card to show this info when an agent is busy.

### 3. Ensure Real-time Updates
- Verify the Convex subscription triggers re-renders
- Check that `useAgentStatus` hook properly updates when data changes

## Acceptance Criteria
- [ ] Agent cards show live status (online/busy/offline/paused)
- [ ] When an agent is busy, show the current task on the card
- [ ] Dashboard updates in real-time when agent status changes
- [ ] No console errors related to ID mismatches

## Testing
After making changes:
1. Start the dev server: `npm run dev`
2. Run a test: `curl -X POST "https://fast-dodo-788.convex.site/agent/start" -H "Content-Type: application/json" -d '{"agentId":"scout","sessionId":"test-123","task":"Test task"}'`
3. Check if Scout's card shows "busy" status and the task
4. Run complete: `curl -X POST "https://fast-dodo-788.convex.site/agent/complete" -H "Content-Type: application/json" -d '{"agentId":"scout","sessionId":"test-123","exitCode":0}'`
5. Check if Scout's card shows "online" status
