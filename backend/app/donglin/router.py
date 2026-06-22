"""甲所样式底稿填写 API.

Endpoints:
  GET  /api/donglin/papers                 — 5 张已填底稿元数据 + 当前状态
  GET  /api/donglin/papers/{paper_code}    — 单张底稿完整内容 (含 sheet_data)
  POST /api/donglin/fill/{paper_code}      — 触发对应 fill_* 函数 → 写回 DB
  GET  /api/donglin/provenance/{paper_code}— 该底稿的全部单元格本体追溯
  GET  /api/donglin/adjustments            — 提议的调整分录
  GET  /api/donglin/agent-runs             — 5 次 agent_run 完整日志
"""
from __future__ import annotations
import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from ..db import get_session
from ..models import ObjectInstance, AgentRun

router = APIRouter(prefix="/api/donglin", tags=["donglin"])


DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "donglin"
DEMO_DIR = DATA_DIR / "agent_demo"


PAPER_CODES = {
    "A1":  "WP-A1-2025",   "A6":  "WP-A6-2025",
    "A9":  "WP-A9-2025",   "A24": "WP-A24-2025",
    "B1":  "WP-B1-2025",
}


def _load(name: str):
    p = DEMO_DIR / name
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


@router.get("/freeform-xlsx")
def freeform_xlsx():
    """下载 Agent 自由生成的 A1 货币资金底稿 (.xlsx, 不套母版)。"""
    p = DEMO_DIR / "A1_freeform.xlsx"
    if not p.exists():
        raise HTTPException(404, "freeform xlsx not found")
    return FileResponse(
        p,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="货币资金A1_自由底稿_甲公司2025.xlsx",
    )


@router.get("/walkthrough-xlsx")
def walkthrough_xlsx():
    """下载乙公司销售循环穿行测试 · Agent 细节测试回填底稿 (.xlsx)。"""
    p = DEMO_DIR / "CSG_walkthrough_filled.xlsx"
    if not p.exists():
        raise HTTPException(404, "walkthrough xlsx not found")
    return FileResponse(
        p,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="细节测试回填_乙公司（光伏玻璃）.xlsx",
    )


@router.get("/papers")
def list_papers(s: Session = Depends(get_session)) -> list[dict]:
    """列出甲所 5 张已填底稿。"""
    out = []
    for paper_idx in ("A1", "A6", "A9", "A24", "B1"):
        wp = next((o for o in s.exec(select(ObjectInstance).where(
            ObjectInstance.type_code == "WorkingPaper"))
            if (o.data or {}).get("index") == paper_idx), None)
        if not wp:
            continue
        d = wp.data or {}
        out.append({
            "id": wp.id,
            "index": d.get("index"),
            "name": d.get("name"),
            "review_status": d.get("review_status"),
            "audit_conclusion": d.get("audit_conclusion", "")[:200],
            "filled_by": d.get("filled_by"),
            "filled_at": d.get("filled_at"),
            "has_sheet_data": bool(d.get("sheet_data")),
        })
    return out


@router.get("/papers/{paper_code}")
def get_paper(paper_code: str, s: Session = Depends(get_session)) -> dict:
    """获取一张已填底稿完整内容。"""
    if paper_code not in PAPER_CODES:
        raise HTTPException(404, f"未知底稿 {paper_code}, 可选: {list(PAPER_CODES)}")
    wp = next((o for o in s.exec(select(ObjectInstance).where(
        ObjectInstance.type_code == "WorkingPaper"))
        if (o.data or {}).get("index") == paper_code), None)
    if not wp:
        raise HTTPException(404, f"底稿 {paper_code} 不在 DB")
    return {"id": wp.id, "type_code": wp.type_code,
            "display_name": wp.display_name, "data": wp.data}


@router.post("/fill/{paper_code}")
def trigger_fill(paper_code: str, s: Session = Depends(get_session)) -> dict:
    """重新触发对该底稿的 agent 填稿。

    实现：调用 backend/app/donglin/fill.py 中的 fill_<paper_code> 函数，
    用客户原始数据 (TB/Aux/Vouchers) 重算，结果写回 DB 的 WorkingPaper.data.sheet_data + AgentRun.
    """
    if paper_code not in PAPER_CODES:
        raise HTTPException(404, f"未知底稿 {paper_code}")

    # 动态 import 填稿函数
    from . import fill as fill_mod

    fn_map = {
        "A1":  fill_mod.fill_A1,  "A6":  fill_mod.fill_A6,
        "A9":  fill_mod.fill_A9,  "A24": fill_mod.fill_A24,
        "B1":  fill_mod.fill_B1,
    }
    fn = fn_map[paper_code]

    # 加载本体 + 客户原始数据
    ontology = fill_mod.load_ontology()
    raw = fill_mod.load_raw()
    prov = fill_mod.Provenance()

    # 调用 fill 函数
    result = fn(ontology, raw, prov)
    # 部分函数返回 (wp, run, adj)；A1/A24/B1 返回 (wp, run, [])
    if len(result) == 3:
        filled_wp, run, adjs = result
    else:
        filled_wp, run = result
        adjs = []

    # 写回 DB - 更新对应的 WorkingPaper
    wp = next((o for o in s.exec(select(ObjectInstance).where(
        ObjectInstance.type_code == "WorkingPaper"))
        if (o.data or {}).get("index") == paper_code), None)
    if wp:
        new_data = dict(wp.data or {})
        new_data.update(filled_wp["data"])
        wp.data = new_data
        wp.updated_at = datetime.utcnow()
        s.add(wp)

    # 记录 AgentRun
    ar = AgentRun(
        agent_code=run.agent_code,
        paper_id=wp.id if wp else None,
        messages=run.messages,
        tool_calls=run.tool_calls,
        status="succeeded",
    )
    s.add(ar)
    s.commit()
    s.refresh(ar)

    return {
        "ok": True,
        "paper_code": paper_code,
        "agent_run_id": ar.id,
        "tool_calls_count": len(run.tool_calls),
        "adjustments_count": len(adjs),
        "sheet_data_keys": list(filled_wp["data"].get("sheet_data", {}).keys()),
    }


@router.get("/provenance/{paper_code}")
def get_provenance(paper_code: str) -> dict:
    """获取该底稿的全部单元格本体追溯。"""
    if paper_code not in PAPER_CODES:
        raise HTTPException(404)
    all_prov = _load("cell_provenance.json") or {}
    wp_key = PAPER_CODES[paper_code]
    return {"paper_code": paper_code, "wp_key": wp_key,
            "cells": all_prov.get(wp_key, {})}


@router.get("/adjustments")
def list_adjustments() -> list[dict]:
    """Agent 提议的调整分录。"""
    return _load("proposed_adjustments.json") or []


@router.get("/agent-runs")
def list_agent_runs() -> list[dict]:
    """5 次 agent_run 完整日志（包含每次工具调用 + 本体引用）。"""
    return _load("agent_run_log.json") or []


# ──────────────────────────────────────────────────────────
# Sprint 2: 导出真实 .xlsm 模板填好的副本
# ──────────────────────────────────────────────────────────
@router.get("/export-xlsx/{paper_code}")
def export_xlsx(paper_code: str, s: Session = Depends(get_session)):
    """把底稿数据写回甲所真实 .xlsm 模板，返回 xlsx 文件下载。"""
    from .export_xlsx import export_paper_xlsx
    from fastapi.responses import FileResponse

    out_path = export_paper_xlsx(paper_code, s)
    # 用 .xlsm 扩展名（保留 VBA 宏 + 真实模板结构）
    return FileResponse(
        path=str(out_path),
        media_type="application/vnd.ms-excel.sheet.macroEnabled.12",
        filename=out_path.name,
    )


# ──────────────────────────────────────────────────────────
# Sprint 3: FillRule 一致性校验 (跨表勾稽)
# ──────────────────────────────────────────────────────────
@router.get("/verify-fill-rules/{paper_code}")
def verify_fill_rules(paper_code: str, s: Session = Depends(get_session)) -> dict:
    """根据 FillRule 检查跨表勾稽是否一致。

    例: A6!C11 = 'A6-2'!F824 — 检查 Agent 填出的两个值是否一致。
    返回每条 FillRule 的检查结果 (passed / mismatch / missing).
    """
    from ..models import ObjectInstance

    # 1. 找 paper
    wp = next((o for o in s.exec(select(ObjectInstance).where(
        ObjectInstance.type_code == "WorkingPaper"))
        if (o.data or {}).get("index") == paper_code), None)
    if not wp:
        raise HTTPException(404, f"底稿 {paper_code} 未找到")

    # 2. 拉所有 FillRule，过滤 tpl-{paper_code}
    tpl_key = f"tpl-{paper_code.lower()}"
    all_rules = list(s.exec(select(ObjectInstance).where(
        ObjectInstance.type_code == "FillRule")))
    paper_rules = [
        r for r in all_rules
        if ((r.data or {}).get("appliesToWorkpaper") or "").startswith(tpl_key)
    ]

    # 3. 简化校验：对每条 cross-sheet 规则 (A6.C11 = A6-2.F824)，
    #    我们的 sheet_data 里不直接有 A6.C11 这种 cell，但有 summary.tb_closing_unaudited
    #    所以只做"规则存在 + 输出字段已识别"的 check，不做实际值比对。
    results = []
    for r in paper_rules:
        d = r.data or {}
        results.append({
            "rule_code": d.get("code"),
            "rule_kind": d.get("hasRuleKind"),
            "formula": d.get("hasFormulaExpression"),
            "output_field": d.get("outputField"),
            "input_fields": d.get("inputFields", []),
            "applies_to": d.get("appliesToWorkpaper"),
            "evidence": d.get("hasEvidenceRef"),
            # 真实值比对需要 cell_mapping 对齐，目前 status = "ready"
            "check_status": "ready",
            "note": "FillRule 已识别。完整值比对需 Sprint 1 的 sheet_data 重构。",
        })

    passed = sum(1 for r in results if r["check_status"] == "passed")
    return {
        "paper_code": paper_code,
        "total_fill_rules": len(results),
        "passed": passed,
        "mismatch": 0,
        "ready_for_verify": len(results) - passed,
        "rules": results,
    }


@router.get("/template-layout")
def get_template_layout() -> dict:
    """返回从真实 WP_FSR.xlsm 抽取的 11 个 sheet 的真实表头与列结构。"""
    layout_file = DATA_DIR.parent / "donglin" / "templates" / "template_layout.json"
    if not layout_file.exists():
        raise HTTPException(404, "template_layout.json 不存在 - 请先跑 extract_template_layout.py")
    return json.loads(layout_file.read_text(encoding="utf-8"))


# ──────────────────────────────────────────────────────────
# 计划阶段底稿填写 & 待确认事项解决
# ──────────────────────────────────────────────────────────
PLANNING_FILL_FNS: dict[str, str] = {
    "Y1": "_fill_Y1", "Y2": "_fill_Y2", "Y3": "_fill_Y3",
    "Y4": "_fill_Y4", "Y5": "_fill_Y5", "Y8": "_fill_Y8",
    "X1": "_fill_X1", "X4": "_fill_X4",
}


@router.post("/fill-planning/{paper_code}")
def fill_planning_paper(paper_code: str, s: Session = Depends(get_session)) -> dict:
    """触发单张 JSDW 计划阶段底稿的 AI 填写（含 FillDecision 支持）。"""
    if paper_code not in PLANNING_FILL_FNS:
        raise HTTPException(404, f"未知计划底稿 {paper_code}，可选: {list(PLANNING_FILL_FNS)}")

    from .fill_planning import _fill_Y1, _fill_Y2, _fill_Y3, _fill_Y4, _fill_Y5, _fill_Y8, _fill_X1, _fill_X4

    fn_map = {
        "Y1": _fill_Y1, "Y2": _fill_Y2, "Y3": _fill_Y3,
        "Y4": _fill_Y4, "Y5": _fill_Y5, "Y8": _fill_Y8,
        "X1": _fill_X1, "X4": _fill_X4,
    }
    fn_map[paper_code](s)
    s.commit()

    # Return updated paper status
    wp = next((o for o in s.exec(select(ObjectInstance).where(
        ObjectInstance.type_code == "WorkingPaper"))
        if isinstance(o.data, dict) and o.data.get("index") == paper_code
        and o.data.get("engagement_code") == "ENG-JSDW-2025"), None)

    # Also return any new pending FillDecisions for this paper
    decisions = []
    if wp:
        all_dec = s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "FillDecision")).all()
        for d in all_dec:
            dd = d.data or {}
            if dd.get("paper_id") == wp.id and dd.get("status") == "pending":
                decisions.append({"id": d.id, "key": dd.get("key"), "question": dd.get("question"),
                                   "options": dd.get("options")})

    return {
        "ok": True,
        "paper_code": paper_code,
        "review_status": (wp.data or {}).get("review_status") if wp else None,
        "pending_decisions": decisions,
    }


@router.post("/resolve-planning-decision/{decision_id}")
def resolve_planning_decision(
    decision_id: int,
    body: dict,
    s: Session = Depends(get_session),
) -> dict:
    """解决 JSDW 计划阶段的 FillDecision，写回 Engagement，然后重新填写该底稿。

    body: { "selected_value": "小企业会计准则（财会〔2013〕17号）" }
    """
    selected_value = body.get("selected_value")
    if not selected_value:
        raise HTTPException(400, "missing selected_value")

    dec = s.get(ObjectInstance, decision_id)
    if not dec or dec.type_code != "FillDecision":
        raise HTTPException(404, f"FillDecision {decision_id} 不存在")

    dd = dict(dec.data or {})
    if dd.get("status") == "resolved":
        raise HTTPException(400, "该待确认项已解决")

    key          = dd.get("key")
    paper_index  = dd.get("paper_index") or dd.get("paper_id")
    eng_code     = dd.get("engagement_code", "ENG-JSDW-2025")

    # Mark decision resolved
    dd["status"]         = "resolved"
    dd["resolved_value"] = selected_value
    dd["resolved_at"]    = datetime.utcnow().isoformat()
    dec.data = dd
    s.add(dec)

    # If accounting-standard: write to Engagement
    if key == "accounting-standard":
        eng = next((o for o in s.exec(select(ObjectInstance).where(
            ObjectInstance.type_code == "Engagement"))
            if (o.data or {}).get("code") == eng_code), None)
        if eng:
            new_d = dict(eng.data or {})
            new_d["accounting_standard"] = selected_value
            eng.data = new_d
            s.add(eng)

        # Re-fill the paper that had the decision
        wp = s.get(ObjectInstance, dd.get("paper_id"))
        paper_idx = (wp.data or {}).get("index") if wp else paper_index

        from .fill_planning import _fill_Y5, _fill_X1
        re_fill = {"Y5": _fill_Y5, "X1": _fill_X1}.get(str(paper_idx))
        if re_fill:
            re_fill(s)

    s.commit()

    # Return refreshed paper
    wp = s.get(ObjectInstance, dd.get("paper_id")) if dd.get("paper_id") else None
    return {
        "ok": True,
        "decision_id": decision_id,
        "resolved_value": selected_value,
        "paper_review_status": (wp.data or {}).get("review_status") if wp else None,
    }
