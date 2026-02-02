# CYD-136: Context Graph Implementation

## Your Role
You are **Friday** 🔧, the Developer Specialist. Implement the Context Graph feature based on Scout's research.

## Critical: Read First
**Read ANALYSIS.md thoroughly before implementing.** It contains:
- Current state analysis of the codebase
- Data model recommendations
- UI approach recommendations
- Implementation roadmap

## Objective
Build the Context Graph feature to visualize agent decision chains, reasoning flows, and task dependencies.

## Implementation Tasks (from ANALYSIS.md)

1. **Enhance decisions schema** (if needed based on analysis)
2. **Create graph data queries** - Build Convex queries that return nodes and edges
3. **Build Context Graph page** - Replace placeholder at `/graph` with real visualization
4. **Implement graph visualization** - Use recommended library from analysis
5. **Add filtering** - By agent, time range, decision type
6. **Connect to real-time** - Decisions should update live

## Key Files (from research)
- `convex/schema.ts` - decisions table exists
- `convex/decisions.ts` - existing queries including getWithChain
- `src/app/(dashboard)/graph/page.tsx` - placeholder to replace
- `src/components/activity/*` - UI patterns to follow

## Constraints
- Follow existing UI patterns (PageHeader, Card, Badge, ScrollArea)
- Use existing realtime patterns (useStateSync)
- Handle ID linkage via agentLinking.ts helpers
- Keep visualization performant (check ANALYSIS.md for scale limits)

## Commit Message
When complete: "feat(cyd-136): Context Graph visualization and decision flow"

Then push to the existing branch - this will update the PR.
