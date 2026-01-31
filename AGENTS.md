# AGENTS.md - Cydni - Mission Control

## Project Overview

Cydni - Mission Control is a web-based command center for AI organization visibility. It provides real-time monitoring of AI agents, decision tracking, and task management.

## Tech Stack

| Component | Package | Version |
|-----------|---------|---------|
| Framework | Next.js | 16.1.6 |
| Language | TypeScript | 5.9.3 |
| Database | Convex | 1.31.7 |
| Auth | Clerk | 6.37.1 |
| Styling | Tailwind CSS | 4.1.18 |
| Components | shadcn/ui | latest |

## Skills Available

Read these SKILL.md files for best practices:

1. **Convex** - `.codex/skills/convex/SKILL.md`
   - Real-time database patterns
   - Schema design
   - Queries and mutations

2. **Vercel React Best Practices** - `.codex/skills/vercel-react-best-practices/SKILL.md`
   - Performance optimization
   - Bundle optimization
   - React patterns

3. **Clerk Next.js** - `.codex/skills/clerk-nextjs-skills/SKILL.md`
   - Authentication setup
   - Middleware configuration
   - Protected routes

4. **Frontend Design** - `.codex/skills/frontend-design/SKILL.md`
   - UI/UX principles
   - Component design
   - Accessibility

5. **shadcn/ui** - `.codex/skills/shadcn-ui/SKILL.md`
   - Component usage
   - Theming
   - Best practices

## Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Dashboard routes (protected)
│   │   ├── agents/         # Agent views
│   │   ├── tasks/          # Task management
│   │   └── graph/          # Decision graph
│   └── layout.tsx          # Root layout
├── components/
│   ├── dashboard/          # Dashboard-specific components
│   ├── providers/          # Context providers
│   └── ui/                 # shadcn/ui components
├── convex/                 # Convex backend
│   ├── schema.ts           # Database schema
│   ├── agents.ts           # Agent queries/mutations
│   ├── tasks.ts            # Task queries/mutations
│   ├── events.ts           # Event logging
│   └── decisions.ts        # Decision tracking
└── lib/                    # Utilities
```

## Coding Standards

### TypeScript
- Strict mode enabled
- Explicit return types on exports
- Zod for runtime validation

### React/Next.js
- Use Server Components by default
- Client Components only when needed (interactivity, hooks)
- Proper Suspense boundaries

### Convex
- Schema-first design
- Use indexes for queries
- Batch operations where possible

### Testing
- Vitest for unit tests
- React Testing Library for components
- Test files colocated with source (*.test.ts(x))
- Aim for 80%+ coverage

### Styling
- Tailwind utility classes
- shadcn/ui components as base
- Dark theme default
- Mobile-first responsive design

## Design Direction

- **Theme:** Dark, minimalist, Vercel-inspired
- **Brand:** Space/lobster themed (Cydni heritage)
- **Colors:** 
  - Primary: Coral/orange (#FF785A)
  - Success: Emerald
  - Warning: Amber
  - Error: Red
  - Neutral: Gray scale
- **Mobile:** Critical - all views must be responsive

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # ESLint
npm run test     # Run tests
npx convex dev   # Start Convex dev
```

## PRD Reference

Full product spec: `/Users/cydni/Documents/JDH-MindTrap/20-Areas/Cydni/specs/Mission-Control-PRD.md`
