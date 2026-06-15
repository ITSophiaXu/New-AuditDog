# Copilot Instructions — Audit Ontology Prototype

## What this project is

A Palantir Foundry–style "Ontology + Agents" demo platform for Chinese CPA firms, built around a real 2025 annual audit engagement (江苏大王, 东林事务所). The backend models audit knowledge as an ontology (object types → link types → action types), and AI agents read that ontology context to fill working papers cell by cell.

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLModel, SQLite, uvicorn |
| Frontend | React 18, Vite 6, TypeScript, Tailwind v4, TanStack Query, Zustand, @xyflow/react |
| LLM | GitHub Models API (OpenAI-compatible); falls back to deterministic DEMO mode without a key |
| Excel I/O | openpyxl (backend), xlsx (frontend) |

## Commands

### Backend
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
# macOS/Linux:
. .venv/bin/activate && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev          # dev server on :5173
npm run build        # tsc -b && vite build
```

### One-command start (Windows / macOS+Linux)
```
start.bat  /  ./start.sh
```

### Environment
Copy `backend/.env.example` → `backend/.env`:
```
GITHUB_TOKEN=ghp_xxx    # optional; omit to use DEMO mode
MODEL_ID=openai/gpt-4o  # default
```

### Useful env flags
| Variable | Effect |
|---|---|
| `AUDIT_ONTOLOGY_SKIP_SEED=1` | Skip DB seed on startup |
| `AUDIT_ONTOLOGY_SKIP_DONGLIN=1` | Skip 东林 data seed only |

### Re-seeding the database
Delete `backend/data/audit_ontology.db`, then restart the server — `app.main._startup()` calls `seed.py` automatically.

### Running the 东林 fill agent manually
```bash
cd backend
.venv\Scripts\python.exe -m app.donglin.fill   # Windows
```

## Architecture

### Core data model (`backend/app/models.py`)
Everything is stored in five SQLite tables:
- **`object_types`** — type definitions (code, display_name, `properties_schema: JSON`)
- **`link_types`** — directed relationships between object types
- **`action_types`** — operations that target an object type (kind: `fill | flag | apply_rule | attach`)
- **`object_instances`** — actual data rows, typed by `type_code`, payload in `data: JSON`
- **`link_instances`** — edges between instances

Agent configuration lives in `agent_configs` + `agent_runs`. Human corrections are in `corrections` + `ontology_changes`.

### Backend module layout
```
backend/app/
├── main.py           # FastAPI app, CORS, router mounting, static files
├── models.py         # All SQLModel table definitions
├── seed.py           # Generic ontology seed (calls seed_donglin at tail)
├── seed_donglin.py   # Loads 东林 JSON data into DB
├── db.py             # SQLite engine + session factory
├── llm.py            # GitHub Models chat() + DEMO mode scripted traces
├── ontology/         # CRUD routes for object/link/action types and instances
├── agents/           # Agent CRUD + runner loop (multi-turn tool-call execution)
├── donglin/          # 东林 working paper fill logic
│   ├── fill.py       # 5 fill_<paper>() functions (A1/A6/A9/A24/B1), 1500+ lines
│   └── router.py     # /api/donglin/* endpoints
├── corrections/      # Human correction capture + ontology-change promotion
├── rules/            # AuditRule seed and evaluation endpoints
├── intake/           # Client data intake wizard
├── templates/        # Working paper template management
└── mcp_registry.py   # MCP server registry (stubs in v1)
```

### Frontend page → backend mapping
| Page component | Primary API prefix |
|---|---|
| `OntologyManager` | `/api/ontology/` |
| `ObjectExplorer` | `/api/ontology/objects` |
| `WorkingPaperWorkbench` | `/api/donglin/`, `/api/agents/` |
| `AgentStudio` / `AgentGallery` | `/api/agents/` |
| `MCPServers` | `/api/mcp/` |
| `SpecialAuditWorkbench` | `/api/agents/run` (special_audit agent) |
| `LearningInbox` | `/api/corrections/` |
| `KnowledgeCenter` | `/api/rules/`, `/api/ontology/objects?type_code=AuditMethod` |

All API calls are centralised in `frontend/src/lib/api.ts`. State for the correction flow lives in `frontend/src/lib/correction-store.ts` (Zustand).

### LLM / DEMO mode (`backend/app/llm.py`)
- `chat()` is the single entry point for all LLM calls.
- Without `GITHUB_TOKEN`, `DEMO_MODE=True` and `_demo_response()` returns a scripted multi-turn tool-call trace.
- The demo routes on tool names: `draft_audit_plan` / `get_case_context` → 专项审计 plan script; everything else → 货币资金 A1 fill script.
- When adding a new agent scenario, add a new branch in `_demo_response()`.

### 东林 working papers (`backend/app/donglin/fill.py`)
Each `fill_<paper>()` function:
1. Reads client data from `backend/data/donglin/input/` (TB, Aux, Vouchers xlsx).
2. Applies hard-coded audit rules (e.g. `AR-RULE-001` for A6 AR ageing, `TAX-RECLASS-001` for A9).
3. Writes the result to the DB as `ObjectInstance` rows with `cell_provenance` metadata.
4. Returns a structured dict matching the working-paper JSON schema.

The JSON seed data in `backend/data/donglin/agent_demo/` (filled_A*.json, cell_provenance.json, etc.) is what `seed_donglin.py` loads on first start.

## Key conventions

### Python
- All models inherit from `SQLModel` with `table=True`; JSON blobs use `sa_column=Column(JSON)`.
- `is_seed=True` marks rows that came from the seed scripts — do not delete or re-create them on subsequent seeds.
- `from __future__ import annotations` is used in every module for forward-reference compatibility.
- Async FastAPI endpoints use `httpx.AsyncClient` for the LLM call; everything else is synchronous SQLite.

### Frontend
- API calls return raw `fetch` promises typed via interfaces in `lib/types.ts`; TanStack Query wraps them in pages.
- The `cn()` helper (`lib/utils.ts`) is used for all conditional Tailwind class merging (clsx + tailwind-merge).
- No test framework is configured (v1 prototype).

### CORS
The backend only allows `http://localhost:5173` and `http://127.0.0.1:5173`. If the frontend port changes (e.g., Vite falls back to `:5174`), update `main.py` `allow_origins`.

### Working paper codes
Papers are identified by short codes: `A1` (货币资金), `A6` (应收账款), `A9` (其他应收款), `A24` (固定资产), `B1` (短期借款). These codes are used as URL path segments, DB keys, and fill function names.

### Ontology rule codes
Rule codes follow the pattern `<DOMAIN>-RULE-<NNN>` (e.g., `CASH-RULE-001`, `AR-RULE-001`, `GC-INDICATOR-001`). Government special-audit rules use `GOV-RULE-<NNN>`.
