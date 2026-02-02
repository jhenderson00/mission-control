# CYD-116: Pending Operations Tracking & Optimistic Updates

## Your Role
You are **Friday** 🔧, the Developer Specialist. Implement this feature end-to-end.

## Objective
Implement pending operation state management with optimistic UI for agent control actions.

## Implementation Tasks

### Convex Queries
- [ ] Active operations by agent (for detail view)
- [ ] Recent operations by operator (for operator view)
- [ ] Bulk operation breakdowns (for bulk status)

### Optimistic UI Pattern
**Non-destructive (pause/resume/priority/redirect):**
- Immediately update UI with "pending" badge
- Subscribe to Convex for operation status
- Reconcile on ack, revert on failure

**Destructive (kill/restart):**
- Show "pending" state but don't flip status until ack
- Clear progress/timeout messaging

### Client State
- Small Zustand store or React state for staging optimistic updates
- Merge with Convex subscription data
- Auto-cleanup completed operations after delay

### Status Display
- Pending operations visible in agent detail view
- Status badges: queued → sent → acked/failed/timed-out
- Error messages with retry action

## Reference
See `specs/prd-cyd97-agent-controls.md` §3 Story 6, §4 (Optimistic UI)

## Commit Message
When complete: "feat(cyd-116): Pending operations tracking with optimistic UI"
