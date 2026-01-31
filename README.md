# Mission Control 🚀

> AI Organization Command Center — See everything your AI organization is doing, why it's doing it, and step in when needed.

A real-time dashboard for monitoring and managing AI agents, built with Next.js 16, Convex, and Tailwind CSS.

## Features

### Phase 1 - Foundation ✅
- **Dashboard** - Fleet status overview, metrics, activity feed
- **Agent Status Grid** - Real-time view of all agents with status indicators
- **Task Management** - Queue, active, blocked, and completed tasks
- **Context Graph** - Decision tracking with reasoning chains (UI complete)
- **Routing** - Full page structure: `/`, `/agents`, `/agents/[id]`, `/tasks`, `/graph`
- **Mobile-first** - Responsive design with mobile navigation

### Coming Soon
- Real-time Convex data (currently using mock data)
- WebSocket streaming for live agent conversations
- Agent controls (pause, redirect, kill)
- Decision accept/reject workflow
- Full-text search
- Analytics dashboard

## Tech Stack

| Component | Package | Version |
|-----------|---------|---------|
| Framework | `next` | `16.1.6` |
| React | `react` | `19.1.0` |
| Database | `convex` | `1.31.7` |
| Auth | `@clerk/nextjs` | `6.37.1` |
| Styling | `tailwindcss` | `4.1.18` |
| Components | `shadcn/ui` | latest |
| Icons | `lucide-react` | `0.511.0` |

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Convex Setup

The project includes Convex schema and functions, but requires a Convex project to be connected:

```bash
# Initialize Convex (if not already done)
npx convex init

# Run Convex dev server (generates types)
npx convex dev
```

Update `.env.local` with your Convex deployment URL:
```
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

## Project Structure

```
mission-control/
├── convex/                    # Convex backend
│   ├── schema.ts              # Data models (Agents, Tasks, Events, Decisions)
│   ├── agents.ts              # Agent queries/mutations
│   ├── tasks.ts               # Task queries/mutations
│   ├── events.ts              # Event logging
│   └── decisions.ts           # Decision tracking
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (dashboard)/       # Dashboard route group
│   │   │   ├── page.tsx       # Main dashboard
│   │   │   ├── agents/        # Agent pages
│   │   │   ├── tasks/         # Task pages
│   │   │   └── graph/         # Context graph
│   │   ├── layout.tsx         # Root layout
│   │   └── globals.css        # Tailwind + custom theme
│   ├── components/
│   │   ├── dashboard/         # Dashboard components
│   │   │   ├── agent-status-grid.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── mobile-nav.tsx
│   │   │   └── page-header.tsx
│   │   ├── providers/         # Context providers
│   │   └── ui/                # shadcn/ui components
│   └── lib/
│       ├── mock-data.ts       # Development mock data
│       └── utils.ts           # Utilities
└── package.json
```

## Design

- **Theme**: Dark mode with subtle space/grid background
- **Aesthetic**: Vercel-inspired minimalism with white/gray outlines
- **Branding**: Space/lobster themed (Clawdbot heritage)
- **Colors**: Emerald (active), Amber (blocked), Red (failed), Blue (queued)

## Data Models

See the PRD for full data model documentation. Key entities:

- **Agent**: AI operators (coordinator, planner, executor, critic, specialist)
- **Task**: Work items with priority, status, success criteria
- **Event**: Activity log for conversation streaming
- **Decision**: Traceable reasoning with context refs and alternatives

---

*Built with 🦞 by Cydni*
