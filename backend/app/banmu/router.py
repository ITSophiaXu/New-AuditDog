"""斑目项目底稿填写 API。

Endpoints:
  POST /api/banmu/fill/{paper_index}   — 触发 AI 预填，返回待确认决策列表
  POST /api/banmu/resolve/{decision_id} — 解决一个判断点
  GET  /api/banmu/decisions/{paper_id}  — 获取某底稿当前所有未决 FillDecision
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import ObjectInstance

from .fill import FILL_FNS, RESUME_FNS

router = APIRouter(prefix="/api/banmu", tags=["banmu"])

BANMU_ENG = "ENG-BANMU-2024"


# ── Set accounting standard ───────────────────────────────────────────

class SetStandardBody(BaseModel):
    value: str  # e.g. "小企业会计准则（财会〔2013〕17号）"


@router.post("/engagement/accounting-standard")
def set_accounting_standard(body: SetStandardBody, s: Session = Depends(get_session)) -> dict:
    """将会计准则写入 Engagement，并重新填写 X1 / Y5 底稿（不重置已人工解决的其他判断点）。"""
    # 1. 更新 Engagement.accounting_standard
    eng = next(
        (obj for obj in s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "Engagement"))
         if (obj.data or {}).get("code") == BANMU_ENG),
        None,
    )
    if eng is None:
        raise HTTPException(404, "斑目项目 Engagement 未找到")
    eng_data = dict(eng.data or {})
    eng_data["accounting_standard"] = body.value
    eng.data = eng_data
    eng.updated_at = datetime.utcnow()
    s.add(eng)
    s.flush()

    # 2. 重新填写所有支持 accounting_standard 的底稿（X1, Y5）
    import inspect
    refilled: list[str] = []
    for paper_index, fill_fn in FILL_FNS.items():
        if "accounting_standard" not in inspect.signature(fill_fn).parameters:
            continue
        wp = _find_paper(paper_index, s)
        if wp is None:
            continue

        # 保留已人工解决的判断点答案
        old_decisions = _decisions_for_paper(wp.id, s)  # type: ignore[arg-type]
        resolved_map = {
            (d.data or {}).get("key"): (d.data or {}).get("resolved_value")
            for d in old_decisions
            if (d.data or {}).get("status") == "resolved"
        }
        for old in old_decisions:
            s.delete(old)
        s.flush()

        result = fill_fn(accounting_standard=body.value)

        new_data = dict(wp.data or {})
        new_data["sheet_data"] = result.sheet_data
        new_data["fill_summary"] = result.fill_summary
        new_data["ai_prefilled_at"] = datetime.utcnow().isoformat()
        new_data["review_status"] = "待人工确认" if result.decisions else "AI 初稿"
        wp.data = new_data
        wp.updated_at = datetime.utcnow()
        s.add(wp)

        # 若其余判断点已在之前解决，直接调用 resume 生成最终数据
        if paper_index in RESUME_FNS:
            merged = {**{(d.key): None for d in result.decisions}, **resolved_map}
            remaining_pending = [
                d for d in result.decisions
                if merged.get(d.key) is None
            ]
            if not remaining_pending:
                final_sd = RESUME_FNS[paper_index](result.sheet_data, merged)
                new_data["sheet_data"] = final_sd
                new_data["review_status"] = "AI 初稿"
                wp.data = new_data
                s.add(wp)

        # 重新创建未解决的判断点
        for dec in result.decisions:
            if resolved_map.get(dec.key) is not None:
                continue  # already resolved, skip
            obj = ObjectInstance(
                type_code="FillDecision",
                display_name=dec.question,
                data={
                    "paper_id":       wp.id,
                    "paper_index":    dec.paper_index,
                    "key":            dec.key,
                    "cell_path":      dec.cell_path,
                    "question":       dec.question,
                    "context":        dec.context,
                    "options":        dec.options,
                    "status":         "pending",
                    "resolved_value": None,
                },
            )
            s.add(obj)

        refilled.append(paper_index)

    s.commit()
    return {"ok": True, "accounting_standard": body.value, "refilled": refilled}


def _find_paper(paper_index: str, s: Session) -> ObjectInstance | None:
    for wp in s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "WorkingPaper")):
        d = wp.data or {}
        if d.get("engagement_code") == BANMU_ENG and d.get("index") == paper_index:
            return wp
    return None


def _decisions_for_paper(paper_id: int, s: Session) -> list[ObjectInstance]:
    return [
        obj
        for obj in s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "FillDecision"))
        if (obj.data or {}).get("paper_id") == paper_id
    ]


# ── Fill ──────────────────────────────────────────────────────────────

@router.post("/fill/{paper_index}")
def fill_paper(paper_index: str, s: Session = Depends(get_session)) -> dict:
    """触发 AI 预填指定斑目底稿（支持 Y3 / Y5 / X1）。"""
    if paper_index not in FILL_FNS:
        raise HTTPException(
            400,
            f"暂不支持 {paper_index}，已实现: {sorted(FILL_FNS)}",
        )

    wp = _find_paper(paper_index, s)
    if wp is None:
        raise HTTPException(404, f"斑目底稿 {paper_index} 未找到")

    # Read accounting_standard from Engagement (filled by auditor after asking the client)
    eng = next(
        (
            obj for obj in s.exec(
                select(ObjectInstance).where(ObjectInstance.type_code == "Engagement")
            )
            if (obj.data or {}).get("code") == BANMU_ENG
        ),
        None,
    )
    acct_std: str | None = (eng.data or {}).get("accounting_standard") if eng else None

    # Delete old FillDecision objects for this paper
    for old in _decisions_for_paper(wp.id, s):  # type: ignore[arg-type]
        s.delete(old)
    s.flush()

    # Run fill logic — pass accounting_standard where supported
    fill_fn = FILL_FNS[paper_index]
    import inspect
    if "accounting_standard" in inspect.signature(fill_fn).parameters:
        result = fill_fn(accounting_standard=acct_std)
    else:
        result = fill_fn()

    # Update paper data
    new_data = dict(wp.data or {})
    new_data["sheet_data"]       = result.sheet_data
    new_data["fill_summary"]     = result.fill_summary
    new_data["ai_prefilled_at"]  = datetime.utcnow().isoformat()
    new_data["review_status"]    = "待人工确认" if result.decisions else "AI 初稿"
    wp.data        = new_data
    wp.updated_at  = datetime.utcnow()
    s.add(wp)

    # Persist FillDecision objects
    decision_ids: list[int] = []
    for dec in result.decisions:
        obj = ObjectInstance(
            type_code="FillDecision",
            display_name=dec.question,
            data={
                "paper_id":    wp.id,
                "paper_index": dec.paper_index,
                "key":         dec.key,
                "cell_path":   dec.cell_path,
                "question":    dec.question,
                "context":     dec.context,
                "options":     dec.options,
                "status":      "pending",
                "resolved_value": None,
            },
        )
        s.add(obj)
        s.flush()
        decision_ids.append(obj.id)  # type: ignore[arg-type]

    s.commit()

    return {
        "ok":              True,
        "paper_index":     paper_index,
        "paper_id":        wp.id,
        "fill_summary":    result.fill_summary,
        "decisions_count": len(result.decisions),
        "decision_ids":    decision_ids,
        "status":          new_data["review_status"],
    }


# ── Resolve ───────────────────────────────────────────────────────────

class ResolveBody(BaseModel):
    selected_value: str


@router.post("/resolve/{decision_id}")
def resolve_decision(
    decision_id: int,
    body: ResolveBody,
    s: Session = Depends(get_session),
) -> dict:
    """解决一个 FillDecision 判断点。所有判断点解决后自动完成填稿。"""
    dec = s.get(ObjectInstance, decision_id)
    if dec is None or dec.type_code != "FillDecision":
        raise HTTPException(404, f"FillDecision {decision_id} 未找到")

    # Mark resolved
    d = dict(dec.data or {})
    d["status"]         = "resolved"
    d["resolved_value"] = body.selected_value
    dec.data        = d
    dec.updated_at  = datetime.utcnow()
    s.add(dec)
    s.flush()

    # Special case: accounting-standard decision → persist to Engagement so all future fills use it
    if d.get("key") == "accounting-standard":
        eng = next(
            (
                obj for obj in s.exec(
                    select(ObjectInstance).where(ObjectInstance.type_code == "Engagement")
                )
                if (obj.data or {}).get("code") == BANMU_ENG
            ),
            None,
        )
        if eng:
            eng_data = dict(eng.data or {})
            eng_data["accounting_standard"] = body.selected_value
            eng.data = eng_data
            eng.updated_at = datetime.utcnow()
            s.add(eng)

    # Check if ALL decisions for this paper are resolved
    paper_id    = d["paper_id"]
    paper_index = d["paper_index"]

    all_decs = _decisions_for_paper(paper_id, s)
    all_resolved = all((obj.data or {}).get("status") == "resolved" for obj in all_decs)

    if all_resolved and paper_index in RESUME_FNS:
        decisions_map = {
            (obj.data or {}).get("key"): (obj.data or {}).get("resolved_value")
            for obj in all_decs
        }
        wp = s.get(ObjectInstance, paper_id)
        if wp:
            current_sd = (wp.data or {}).get("sheet_data", {})
            final_sd   = RESUME_FNS[paper_index](current_sd, decisions_map)
            new_data   = dict(wp.data or {})
            new_data["sheet_data"]    = final_sd
            new_data["review_status"] = "AI 初稿"
            wp.data       = new_data
            wp.updated_at = datetime.utcnow()
            s.add(wp)

    s.commit()

    return {
        "ok":             True,
        "decision_id":    decision_id,
        "resolved_value": body.selected_value,
        "all_resolved":   all_resolved,
        "paper_status":   "AI 初稿" if all_resolved else "待人工确认",
    }


# ── Decisions list ────────────────────────────────────────────────────

@router.get("/decisions/{paper_id}")
def get_decisions(paper_id: int, s: Session = Depends(get_session)) -> list[dict]:
    """返回某底稿当前所有 FillDecision（含已解决的）。"""
    decs = _decisions_for_paper(paper_id, s)
    return [
        {"id": obj.id, "display_name": obj.display_name, "data": obj.data}
        for obj in decs
    ]
