# Mission Control

AI Organization Command Center for orchestrating agents, tasks, events, and decisions.

## Stack (pinned versions)
- Next.js 16.1.6
- React 19.1.0
- TypeScript 5.9.3
- Tailwind CSS 4.1.18 (dark mode default)
- Convex 1.31.7
- Clerk 6.37.1
- lucide-react 0.511.0
- date-fns 4.1.0
- zod 3.25.0

## Getting Started
```bash
npm install
npm run dev
```
Open http://localhost:3000

## Convex Setup
Convex needs interactive configuration for your project/deployment. Run this locally:
```bash
npx convex dev --once --configure=new
```
This will prompt you to log in and choose/create a project. After that you can run:
```bash
npx convex dev
```

## Routes
- `/` Mission dashboard overview
- `/agents` Agent roster
- `/agents/[id]` Agent detail & conversation stream
- `/tasks` Task queue
- `/graph` Context graph

## Project Structure
```
src/app/(dashboard)/      Dashboard routes and layout
src/components/ui/        shadcn/ui components
src/components/dashboard/ Dashboard-specific components
src/lib/                  Shared utilities
convex/                   Convex schema and functions
```

## Notes
- Dark mode is enabled by default via the `dark` class on `html`.
- shadcn/ui components installed: button, card, badge, input, separator, scroll-area, tabs.
