# Agents Page Upgrade Spec (v1)

**Date:** 2026-02-17  
**Goal:** Upgrade `/agents` from basic summary cards to an operator-grade agent intelligence screen.

---

## 1) Product Goals

1. Show each agent’s **effective model**:
   - primary model (if explicitly set on agent)
   - otherwise fallback to `agents.defaults.model` from OpenClaw config
2. Open agent detail view on card click.
3. In detail view, show role/agent metadata, key MD files, and sessions.
4. Keep all behavior contract-driven (no direct random calls from page components).

---

## 2) UX Scope

## 2.1 `/agents` (grid page)
Each card should show:
- Agent display name
- Role
- Status (idle/busy/offline)
- Success %, avg duration, total attempts
- **Model badge** (`effectiveModel`) + source badge (`primary` or `default`)
- Quick health chips:
  - registered in OpenClaw
  - profile files complete/incomplete

Card click should navigate to:
- `/agents/:agentId` (preferred), or
- open drawer/modal (acceptable fallback)

## 2.2 Agent detail page (`/agents/:agentId`)
Sections:
1. **Header**
   - name, role, id
   - effective model + source
   - status and runtime chips
2. **Profile Files (MD docs)**
   - list: `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`
   - file state (exists/missing)
   - tabbed markdown viewer with readable typography
3. **Sessions**
   - recent sessions list (id, updatedAt, message count if available)
   - open session action (for now: route or modal with metadata + optional tail preview)
4. **Recent activity diagnostics**
   - last attempts, failures, retry hotspots (if data available)

---

## 3) Backend Requirements

Current `/api/v1/agents` is too shallow. Add:

## 3.1 `GET /api/v1/agents`
Extend list item shape with:
- `agentId` (openclaw id)
- `effectiveModel` (string)
- `modelSource` (`primary` | `default` | `unknown`)
- `registered` (bool)
- `workspace` (safe path string)
- `profileHealth`:
  - `ok` (bool)
  - `missingFiles` (string[])

## 3.2 `GET /api/v1/agents/{agentId}`
Returns:
- base agent metadata
- model fields above
- profile file index
- optional high-level session stats

## 3.3 `GET /api/v1/agents/{agentId}/files`
Returns safe list of known profile docs with metadata:
- name
- relativePath
- exists
- size
- updatedAt

## 3.4 `GET /api/v1/agents/{agentId}/files/{fileKey}`
- `fileKey` allowlist only: `agents|soul|identity|user|tools`
- returns markdown text content (safe, capped length)

## 3.5 `GET /api/v1/agents/{agentId}/sessions`
Returns recent sessions for this agent:
- sessionKey/id
- updatedAt
- createdAt (if available)
- messageCount (if available)

## 3.6 (Optional) `GET /api/v1/agents/{agentId}/sessions/{sessionKey}`
Return safe summary/tail preview.

---

## 4) OpenClaw Data Rules

1. Use `openclaw agents list --json` as primary source.
2. For default model fallback, read only needed field from OpenClaw config:
   - `agents.defaults.model`
3. Never expose auth/secrets from OpenClaw files.
4. File reads must use strict allowlist and safe base path checks.

---

## 5) Frontend Implementation Notes

Files likely touched:
- `frontend/src/routes/agents.tsx`
- `frontend/src/router.tsx` (add detail route)
- `frontend/src/routes/agent-detail.tsx` (new)
- `frontend/src/queries/useSnapshot.ts` (new hooks)
- `frontend/src/types/domain.ts` (extend `Agent` safely)
- reusable components for markdown viewer/session list

Backend likely touched:
- `backend/app/routers/agents.py`
- `backend/app/services/openclaw.py`
- `backend/app/models/domain.py` (if typed models added)

---

## 6) Security Constraints

- No raw arbitrary file read endpoint.
- No traversal (`../`) risk.
- No secret-bearing files exposed.
- Keep all new routes envelope-compatible.

---

## 7) Validation Checklist

### Backend
```bash
cd backend
. .venv/bin/activate
pytest -q
```

### Frontend
```bash
cd frontend
npm run lint
npm run test:run
npm run build
```

### Integration smoke
- `/agents` cards show effective model and source
- clicking card opens detail page/view
- MD files render cleanly
- session list loads without errors

---

## 8) Nice-to-have (if time)

- full-text search within markdown docs in detail view
- copy model/workspace/session key buttons
- profile completeness score badge
