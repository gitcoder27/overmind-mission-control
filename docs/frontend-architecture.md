# Frontend Architecture

## Overview

Overmind Mission Control is a real-time dashboard for monitoring and controlling an autonomous multi-agent orchestration framework. The frontend is built as a standalone SPA that works immediately with mock data, can connect to the legacy snapshot API, and is pre-wired for the upcoming v1 REST + WebSocket backend.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Build | Vite | 7.x |
| Framework | React | 19.x |
| Language | TypeScript (strict) | 5.x |
| Routing | TanStack Router | 1.x |
| Server State | TanStack Query | 5.x |
| Client State | Zustand | 5.x |
| Styling | Tailwind CSS | 4.x |
| Charts | Recharts | 2.x |
| Icons | Lucide React | 0.x |

## Directory Structure

```
frontend/
├── index.html              # Entry HTML (Google Fonts, dark mode)
├── vite.config.ts           # Build config, proxy, aliases
├── tsconfig.app.json        # TS strict, path aliases
├── .env                     # Runtime config (provider, URLs)
└── src/
    ├── main.tsx             # App entry: providers + router
    ├── router.tsx           # Route tree definition
    ├── index.css            # Tailwind v4 theme + custom CSS
    ├── types/
    │   ├── domain.ts        # Canonical domain types
    │   └── api.ts           # API response envelopes
    ├── lib/
    │   ├── utils.ts         # cn(), formatters, status colors
    │   └── websocket.ts     # WebSocket manager w/ reconnect
    ├── stores/
    │   └── uiStore.ts       # Zustand UI state
    ├── queries/
    │   ├── keys.ts          # Query key factory
    │   └── useSnapshot.ts   # All data-fetching hooks
    ├── providers/
    │   └── data/
    │       ├── types.ts     # DataProvider interface
    │       ├── index.ts     # Provider factory + React context
    │       ├── mock/        # Mock provider + fixtures
    │       ├── legacy/      # Legacy snapshot adapter
    │       └── api/         # Full API v1 provider
    ├── components/
    │   ├── layout/          # RootLayout, Sidebar, TopNav
    │   └── ui/              # 11 reusable components
    └── routes/              # 7 page components
        ├── overview.tsx     # / — Command Center
        ├── projects-list.tsx # /projects
        ├── project-detail.tsx # /projects/$projectId
        ├── live.tsx         # /live — Live Operations
        ├── agents.tsx       # /agents — Agent Fleet
        ├── cron.tsx         # /scheduling/cron
        └── system.tsx       # /system — System Health
```

## Data Flow

```
                  ┌─────────────────┐
                  │  VITE_DATA_PROVIDER │
                  │  (mock|legacy|api) │
                  └────────┬────────┘
                           │
                  ┌────────▼────────┐
                  │  DataProvider    │  (interface)
                  │  Factory         │
                  └────────┬────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼─────┐ ┌───▼─────┐
        │   Mock     │ │ Legacy  │ │  API    │
        │  Provider  │ │ Provider│ │Provider │
        └─────┬─────┘ └───┬─────┘ └───┬─────┘
              │            │            │
              └────────────┼────────────┘
                           │
                  ┌────────▼────────┐
                  │  React Context   │
                  │  useDataProvider()│
                  └────────┬────────┘
                           │
                  ┌────────▼────────┐
                  │ TanStack Query   │
                  │  useSnapshot()   │
                  │  useProjects()   │
                  │  useAgents()     │
                  │  ...             │
                  └────────┬────────┘
                           │
                  ┌────────▼────────┐
                  │  Route Pages     │
                  │  + UI Components │
                  └──────────────────┘
```

## Design System

### Color Palette

- **void** `#04060e` — deepest background
- **abyss** `#080c1a` — sidebar, panels
- **surface** `#0c1121` — card backgrounds
- **surface-elevated** `#131c33` — elevated cards
- **accent** `#22d3a7` — primary actions, success
- **info** `#3b82f6` — informational, links
- **warn** `#f59e0b` — warnings
- **danger** `#ef4444` — errors, critical
- **purple** `#a78bfa` — decorative accent

### Typography

- **Sans**: Plus Jakarta Sans (200-800 weight)
- **Mono**: JetBrains Mono (300-600 weight)

### Effects

- `glass` — glassmorphism with backdrop blur
- `bg-grid` — subtle grid background pattern
- `glow-accent/danger/info` — colored glow box shadows
- `animate-pulse-dot` — pulsing status indicator
- `animate-fade-in` — entry animation
- `stagger-children` — cascading child animations

## Key Patterns

### 1. Provider Adapter Pattern
All data access goes through `DataProvider` interface. Providers declare capabilities — UI adapts (e.g., mutation buttons disabled when provider doesn't support mutations).

### 2. Query Key Factory
Structured query keys in `queries/keys.ts` enable granular invalidation and prevent key collisions.

### 3. Canonical Types
Single set of domain types (`types/domain.ts`) used everywhere. Legacy provider maps snake_case API responses to these types.

### 4. Component Architecture
- **Layout components** manage app shell and navigation
- **UI components** are stateless, reusable primitives
- **Route pages** compose UI components with data hooks

### 5. UX States
Every route page handles: loading (skeletons), error (retry), empty (guidance), and data states.
