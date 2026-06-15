"""Rule authoring backend.

Routes:
    POST /api/rules/compile-and-preview   — NL -> structured rule + hit preview
    POST /api/rules/refine                — counter-examples -> tightened rule
    POST /api/rules/save                  — persist as AuditRule (+ optional run)
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..llm import is_demo, chat as llm_chat
from ..models import ObjectInstance, LinkInstance
from ..provenance import make_provenance
from ..schemas import RuleCompileIn, RuleRefineIn, RuleSaveIn


router = APIRouter()


# ---------- Endpoints ----------

@router.post("/rules/compile-and-preview")
async def compile_and_preview(body: RuleCompileIn, s: Session = Depends(get_session)) -> dict[str, Any]:
    if not body.description.strip():
        raise HTTPException(400, "description required")

    template_fields = _template_fields(s, body.scope_template_code) if body.scope_template_code else []
    if is_demo():
        compiled = _demo_compile(body.description, body.severity, template_fields, body.scope_template_code)
    else:
        compiled = await _llm_compile(body.description, body.severity, template_fields, body.scope_template_code)

    hits, scanned = _run_against_papers(s, compiled, body.scope_template_code)
    return {
        "compiled": compiled,
        "interpretation": compiled.get("interpretation", "未生成解释"),
        "scanned_papers": scanned,
        "hits": hits,
        "demo": is_demo(),
    }


@router.post("/rules/refine")
async def refine(body: RuleRefineIn, s: Session = Depends(get_session)) -> dict[str, Any]:
    template_code = (body.compiled or {}).get("scope_template_code")
    template_fields = _template_fields(s, template_code) if template_code else []

    if is_demo():
        compiled = _demo_refine(body.compiled, body.false_positives, body.description)
    else:
        compiled = await _llm_refine(body.description, body.compiled, body.false_positives, template_fields)

    hits, scanned = _run_against_papers(s, compiled, template_code)
    return {
        "compiled": compiled,
        "interpretation": compiled.get("interpretation", "未生成解释"),
        "scanned_papers": scanned,
        "hits": hits,
        "refined": True,
    }


@router.post("/rules/save")
def save_rule(body: RuleSaveIn, s: Session = Depends(get_session)) -> dict[str, Any]:
    compiled = body.compiled or {}
    if not compiled.get("name"):
        raise HTTPException(400, "compiled.name required")

    rcode = compiled.get("code") or f"RULE-NL-{abs(hash(compiled.get('name',''))) % 9000 + 1000}"
    if any((r.data or {}).get("code") == rcode
           for r in s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "AuditRule"))):
        raise HTTPException(400, f"rule {rcode} already exists")

    prov = make_provenance(
        origin="wizard",
        bundle=f"firm-imported@{datetime.utcnow().strftime('%Y-%m')}",
        version="0.1.0",
        issuer=compiled.get("issuer") or "审计员中文描述",
        effective_from=datetime.utcnow().strftime("%Y-%m-%d"),
        author=body.compiled.get("author") or "rule-author",
        status="active",
    )
    rule_data = {
        "code": rcode,
        "name": compiled["name"],
        "category": compiled.get("category") or "通用",
        "expression": compiled.get("expression") or compiled.get("interpretation") or "",
        "nl_description": compiled.get("nl_description") or "",
        "severity": compiled.get("severity") or "medium",
        "source": "事务所",
        "issuer": "审计员中文描述",
        "effective": datetime.utcnow().strftime("%Y-%m"),
        "compiled": compiled,
        "scope_template_code": body.scope_template_code,
        "provenance": prov,
    }
    obj = ObjectInstance(type_code="AuditRule", display_name=compiled["name"], data=rule_data)
    s.add(obj); s.commit(); s.refresh(obj)

    # Attach as default_rule on the scoped template if requested
    if body.scope_template_code:
        templates = list(s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "PaperTemplate")))
        for t in templates:
            if (t.data or {}).get("code") == body.scope_template_code:
                data = dict(t.data or {})
                drs = list(data.get("default_rules") or [])
                if rcode not in drs:
                    drs.append(rcode)
                data["default_rules"] = drs
                t.data = data
                t.updated_at = datetime.utcnow()
                s.add(t); s.commit()
                break

    triggered_papers: list[dict[str, Any]] = []
    if body.run_on_existing:
        hits, _ = _run_against_papers(s, compiled, body.scope_template_code)
        for h in hits:
            anomaly = ObjectInstance(
                type_code="Anomaly",
                display_name=h.get("explanation", "异常"),
                data={
                    "rule_code": rcode,
                    "paper_id": h["paper_id"],
                    "detail": h.get("explanation", ""),
                    "severity": compiled.get("severity", "medium"),
                    "status": "open",
                },
            )
            s.add(anomaly); s.commit(); s.refresh(anomaly)
            s.add(LinkInstance(
                link_type_code="AnomalyOnPaper",
                source_id=anomaly.id, target_id=h["paper_id"],
            ))
            s.commit()
            triggered_papers.append({"paper_id": h["paper_id"], "anomaly_id": anomaly.id})

    return {"ok": True, "rule_id": obj.id, "rule_code": rcode, "triggered": triggered_papers}


# ---------- Internal: template lookup ----------

def _template_fields(s: Session, code: str | None) -> list[dict[str, Any]]:
    if not code:
        return []
    for t in s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "PaperTemplate")):
        if (t.data or {}).get("code") == code:
            return _flatten_template_fields(t.data or {})
    return []


def _flatten_template_fields(template_data: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for sh in (template_data.get("sheets") or []):
        for f in sh.get("fields") or []:
            out.append({**f, "sheet_code": sh.get("code"), "kind": "summary_field"})
        for c in sh.get("columns") or []:
            out.append({**c, "sheet_code": sh.get("code"), "kind": "table_column"})
    for f in (template_data.get("fields") or []):
        out.append({**f, "sheet_code": "(flat)", "kind": "flat"})
    return out


# ---------- Rule engine: simple expression evaluator ----------

def _run_against_papers(
    s: Session,
    compiled: dict[str, Any],
    template_code: str | None,
) -> tuple[list[dict[str, Any]], int]:
    """Evaluate compiled rule across all working papers matching template_code.

    The compiled form supports two evaluation paths:
      - "field_diff": {left: field_path, right: field_path, op: '!=' | '>' | '<', threshold: number}
      - "table_predicate": {sheet_code, predicate: {column, op, value}}
    Returns (hits, scanned_count).
    """
    papers = list(s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "WorkingPaper")))
    if template_code:
        papers = [p for p in papers if (p.data or {}).get("template_code") == template_code]
    hits: list[dict[str, Any]] = []
    for p in papers:
        finding = _evaluate_rule(compiled, p)
        if finding is not None:
            hits.append({
                "paper_id": p.id,
                "paper_name": p.display_name,
                "explanation": finding["explanation"],
                "context": finding.get("context", {}),
            })
    return hits, len(papers)


def _evaluate_rule(compiled: dict[str, Any], paper: ObjectInstance) -> dict[str, Any] | None:
    sheet_data = (paper.data or {}).get("sheet_data") or {}
    kind = compiled.get("eval_kind") or "field_diff"
    threshold = float(compiled.get("threshold", 0) or 0)

    if kind == "field_diff":
        left = _read_path(sheet_data, compiled.get("left", ""))
        right = _read_path(sheet_data, compiled.get("right", ""))
        if left is None or right is None:
            return None
        try:
            l_num = float(left); r_num = float(right)
        except (TypeError, ValueError):
            return None
        diff = abs(l_num - r_num)
        op = compiled.get("op", "!=")
        triggered = False
        if op == "!=":
            triggered = diff > threshold
        elif op == ">":
            triggered = (l_num - r_num) > threshold
        elif op == "<":
            triggered = (r_num - l_num) > threshold
        if triggered:
            return {
                "explanation": (
                    f"{compiled.get('left')} ({l_num:,.2f}) 与 "
                    f"{compiled.get('right')} ({r_num:,.2f}) 不一致，差额 {diff:,.2f}"
                ),
                "context": {"diff": diff, "left": l_num, "right": r_num},
            }
        return None

    if kind == "table_predicate":
        sheet_code = compiled.get("sheet_code", "")
        column = compiled.get("column", "")
        op = compiled.get("op", "==")
        value = compiled.get("value")
        rows = (sheet_data.get(sheet_code) or {}).get("rows") or []
        matched = []
        for i, row in enumerate(rows):
            cell = (row or {}).get(column)
            if _cell_matches(cell, op, value):
                matched.append({"row_index": i, "row": row})
        if matched:
            return {
                "explanation": f"{sheet_code} 中有 {len(matched)} 行满足条件 ({column} {op} {value})",
                "context": {"matched_count": len(matched), "first": matched[0]},
            }
        return None

    return None


def _cell_matches(cell: Any, op: str, value: Any) -> bool:
    try:
        if op == "==":
            return cell == value
        if op == "!=":
            return cell != value
        if op == ">":
            return float(cell) > float(value)
        if op == "<":
            return float(cell) < float(value)
        if op == ">=":
            return float(cell) >= float(value)
        if op == "<=":
            return float(cell) <= float(value)
    except (TypeError, ValueError):
        return False
    return False


def _read_path(sheet_data: dict[str, Any], path: str) -> Any:
    """Read 'sheet_code.field_code' from sheet_data."""
    parts = path.split(".")
    if len(parts) < 2:
        return None
    sheet = sheet_data.get(parts[0]) or {}
    return sheet.get(parts[1])


# ---------- Demo compile / refine ----------

def _demo_compile(
    description: str,
    severity: str,
    template_fields: list[dict[str, Any]],
    template_code: str | None,
) -> dict[str, Any]:
    desc = description.strip()
    # Try to detect "X 与 Y 不一致 / 不相等"
    m = re.search(r"(.{2,20})\s*(与|和|跟)\s*(.{2,20})\s*(不一致|不相等|不符|不匹配)", desc)
    if m:
        left_label, _, right_label, _ = m.groups()
        left = _match_field(left_label, template_fields)
        right = _match_field(right_label, template_fields)
        if left and right:
            return {
                "name": f"{left['label']} 与 {right['label']} 一致性",
                "category": "数据一致性",
                "severity": severity,
                "nl_description": desc,
                "eval_kind": "field_diff",
                "left": f"{left.get('sheet_code', 'summary')}.{left['code']}",
                "right": f"{right.get('sheet_code', 'summary')}.{right['code']}",
                "op": "!=",
                "threshold": 0,
                "scope_template_code": template_code,
                "interpretation": (
                    f"在每张底稿上检查 {left['label']} 与 {right['label']} 是否相等；"
                    "不相等时按 {severity} 级别标记异常。"
                ).replace("{severity}", severity),
                "ai_guess": True,
            }

    # Try to detect "X 超过 N" / "X > N"
    m = re.search(r"(.{2,20})\s*(超过|大于|>)\s*([\d,]+)\s*(元|万|份|个|条)?", desc)
    if m:
        label, _, num, _ = m.groups()
        field = _match_field(label, template_fields)
        if field:
            return {
                "name": f"{field['label']} 大额提示",
                "category": "数量阈值",
                "severity": severity,
                "nl_description": desc,
                "eval_kind": "field_diff",
                "left": f"{field.get('sheet_code', 'summary')}.{field['code']}",
                "right": f"{field.get('sheet_code', 'summary')}.{field['code']}",
                "op": ">",
                "threshold": float(num.replace(",", "")),
                "scope_template_code": template_code,
                "interpretation": f"{field['label']} 超过 {num} 时标记。",
                "ai_guess": True,
            }

    # Fallback: row-level "标记 ... 为异常"
    return {
        "name": desc[:30] or "新规则",
        "category": "通用",
        "severity": severity,
        "nl_description": desc,
        "eval_kind": "table_predicate",
        "sheet_code": "cutoff_test",
        "column": "is_proper",
        "op": "==",
        "value": False,
        "scope_template_code": template_code,
        "interpretation": "检查截止性测试表中 is_proper 为 false 的凭证。",
        "ai_guess": True,
    }


def _demo_refine(
    compiled: dict[str, Any],
    false_positives: list[dict[str, Any]],
    description: str,
) -> dict[str, Any]:
    out = dict(compiled or {})
    # Heuristic: from false positives' contexts find a tighter threshold for field_diff rules
    if compiled.get("eval_kind") == "field_diff" and false_positives:
        diffs = [fp.get("context", {}).get("diff") for fp in false_positives
                 if fp.get("context", {}).get("diff") is not None]
        if diffs:
            # set threshold above largest false-positive diff (rounded up)
            new_threshold = max(diffs) + 1
            out["threshold"] = float(new_threshold)
            out["interpretation"] = (
                out.get("interpretation", "")
                + f"\n（已根据反例细化：差额需 > {new_threshold:,.0f} 才标记）"
            )
            out["refined_from"] = compiled.get("threshold")
    out["nl_description"] = description or out.get("nl_description", "")
    return out


def _match_field(label: str, fields: list[dict[str, Any]]) -> dict[str, Any] | None:
    label = label.strip()
    if not label or not fields:
        return None
    # exact
    for f in fields:
        if f.get("label") == label:
            return f
    # substring either way
    for f in fields:
        flabel = f.get("label") or ""
        if flabel and (label in flabel or flabel in label):
            return f
    return None


# ---------- LLM compile / refine ----------

async def _llm_compile(
    description: str,
    severity: str,
    template_fields: list[dict[str, Any]],
    template_code: str | None,
) -> dict[str, Any]:
    system = (
        "你是审计规则编译助手。把审计员的中文描述编译为结构化的可执行规则。"
        "输出严格 JSON，结构：\n"
        '{"name":中文规则名,"category":中文类别,"severity":"low|medium|high","nl_description":原文,'
        '"eval_kind":"field_diff"|"table_predicate","left"?:string,"right"?:string,"op":"!="|">"|"<"|"=="|">="|"<="',
        '"threshold"?:number,"sheet_code"?:string,"column"?:string,"value"?:any,'
        '"interpretation":中文解释一句话,"ai_guess":true}\n'
        "若是字段比较类规则用 field_diff；如果是行级判定（某列等于某值）用 table_predicate。"
        f"模板可用字段：{json.dumps(template_fields, ensure_ascii=False)[:2000]}\n"
        "left/right 形如 'sheet_code.field_code'。"
    )
    res = await llm_chat(
        [{"role": "system", "content": system},
         {"role": "user", "content": f"严重程度: {severity}\n规则描述：{description}"}],
        tools=None,
    )
    parsed = _parse_json_obj(res.content)
    if parsed:
        parsed.setdefault("scope_template_code", template_code)
        return parsed
    return _demo_compile(description, severity, template_fields, template_code)


async def _llm_refine(
    description: str,
    compiled: dict[str, Any],
    false_positives: list[dict[str, Any]],
    template_fields: list[dict[str, Any]],
) -> dict[str, Any]:
    system = (
        "你是审计规则编译助手。审计员反馈以下命中条目并非真正异常，请给出一版改进的规则（更严格的条件、"
        "或更窄的范围）。输出与原规则相同的 JSON schema，并在 interpretation 中说明改了哪里。"
        f"模板可用字段：{json.dumps(template_fields, ensure_ascii=False)[:1500]}"
    )
    user = json.dumps({
        "description": description,
        "previous_compiled": compiled,
        "false_positives": false_positives,
    }, ensure_ascii=False)
    res = await llm_chat(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        tools=None,
    )
    parsed = _parse_json_obj(res.content)
    if parsed:
        return parsed
    return _demo_refine(compiled, false_positives, description)


def _parse_json_obj(text: str) -> dict[str, Any] | None:
    txt = (text or "").strip()
    if txt.startswith("```"):
        txt = txt.strip("` \n")
        if txt.lower().startswith("json"):
            txt = txt[4:].strip()
    try:
        obj = json.loads(txt)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None
