"""FastAPI entrypoint."""
from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from .db import init_db
from .seed import seed as run_seed
from .llm import is_demo, MODEL_ID
from .ontology.router import router as ontology_router
from .agents.router import router as agents_router
from .mcp_registry import router as mcp_router
from .intake.router import router as intake_router
from .corrections.router import router as corrections_router
from .templates.router import router as templates_router
from .rules.router import router as rules_router
from .donglin.router import router as donglin_router
from .banmu.router import router as banmu_router
from .archive_router import router as archive_router

app = FastAPI(title="Audit Ontology Prototype", version="0.1.0")

_CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)


@app.on_event("startup")
def _startup() -> None:
    init_db()
    if os.environ.get("AUDIT_ONTOLOGY_SKIP_SEED", "0") != "1":
        run_seed()


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "llm_demo_mode": is_demo(),
        "model": MODEL_ID,
    }


app.include_router(ontology_router, prefix="/api/ontology", tags=["ontology"])
app.include_router(agents_router, prefix="/api", tags=["agents"])
app.include_router(mcp_router, prefix="/api", tags=["mcp"])
app.include_router(intake_router, prefix="/api", tags=["intake"])
app.include_router(corrections_router, prefix="/api", tags=["corrections"])
app.include_router(templates_router, prefix="/api", tags=["templates"])
app.include_router(rules_router, prefix="/api", tags=["rules"])
app.include_router(donglin_router)  # 东林样式底稿填写 (prefix 已含 /api/donglin)
app.include_router(banmu_router)    # 斑目项目底稿预填 (prefix 已含 /api/banmu)
app.include_router(archive_router)  # 项目档案 (prefix 已含 /api/archive)

# 静态资源：东林 demo HTML
from pathlib import Path as _Path
from fastapi.staticfiles import StaticFiles as _SF
_DONGLIN_DATA = _Path(__file__).resolve().parent.parent / "data" / "donglin"
if _DONGLIN_DATA.exists():
    app.mount("/donglin-static", _SF(directory=str(_DONGLIN_DATA)), name="donglin_static")


@app.get("/donglin")
def donglin_demo_redirect():
    """重定向到东林 demo HTML（单文件离线版）。"""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/donglin-static/audit_ontology_review.html")
# -*- coding: utf-8 -*-
# SPA static hosting + fallback appended below
_FRONTEND_DIST = _Path(
    os.environ.get("FRONTEND_DIST", str(_Path(__file__).resolve().parents[2] / "frontend" / "dist"))
)
if _FRONTEND_DIST.exists():
    from fastapi.responses import FileResponse as _FileResponse
    if (_FRONTEND_DIST / "assets").exists():
        app.mount("/assets", _SF(directory=str(_FRONTEND_DIST / "assets")), name="spa_assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        """SPA catch-all: return index.html for React Router."""
        return _FileResponse(str(_FRONTEND_DIST / "index.html"))
