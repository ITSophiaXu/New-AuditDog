"""项目档案 API — 用于「项目档案」页面查询各底稿状态。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from .db import get_session
from .models import ObjectInstance

router = APIRouter(prefix="/api/archive", tags=["archive"])


@router.get("/engagements")
def list_engagements(s: Session = Depends(get_session)) -> list[dict]:
    """返回所有 Engagement 对象（供项目档案左侧列表使用）。"""
    engs = s.exec(
        select(ObjectInstance).where(ObjectInstance.type_code == "Engagement")
    ).all()
    out = []
    for e in engs:
        d = e.data or {}
        # Derive year from period or code
        period = d.get("period", "")
        year = period[:4] if period else (d.get("code", "")[-4:] if d.get("code") else "")
        out.append({
            "id": e.id,
            "display_name": e.display_name or "",
            "code": d.get("code", ""),
            "short_name": d.get("short_name") or d.get("company_name") or e.display_name or "",
            "company_name": d.get("company_name") or e.display_name or "",
            "status": d.get("status", ""),
            "year": year,
            "industry": d.get("industry", ""),
            "partner": d.get("partner", ""),
        })
    # Sort: active first, then by year desc
    order = {"进行中": 0, "": 1, "已完成": 2}
    out.sort(key=lambda x: (order.get(x["status"], 1), x.get("year", "")), reverse=False)
    return out


@router.get("/papers")
def papers_status(eng_code: str, s: Session = Depends(get_session)) -> list[dict]:
    """返回指定项目所有底稿的状态（用于项目档案影响分析）。"""
    all_papers = s.exec(
        select(ObjectInstance).where(ObjectInstance.type_code == "WorkingPaper")
    ).all()
    out = []
    for wp in all_papers:
        d = wp.data or {}
        if d.get("engagement_code") != eng_code:
            continue
        out.append({
            "id": wp.id,
            "index": d.get("index", ""),
            "name": d.get("name", ""),
            "review_status": d.get("review_status", "unfilled"),
            "filled_at": d.get("filled_at"),
        })
    return out

