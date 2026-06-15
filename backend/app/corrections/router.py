"""Correction loop endpoints.

Routes:
    POST /api/corrections                 — record a cell-level correction
    GET  /api/corrections?paper_id=       — list corrections (per-paper or all)
    POST /api/corrections/{id}/propose    — LLM proposes an ontology delta
    POST /api/ontology-changes/apply      — apply a delta with scope
    POST /api/ontology-changes/{id}/rollback
    GET  /api/ontology-changes            — change log (for timeline)
    GET  /api/learning-inbox              — aggregated cross-auditor suggestions
"""
from __future__ import annotations

import copy
import json
import re
from collections import defaultdict
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..llm import is_demo, chat as llm_chat
from ..models import (
    Correction, OntologyChange,
    ObjectInstance,
)
from ..schemas import CorrectionIn, ApplyChangeIn, ProposeDeltaResponse


router = APIRouter()


# ---------- Path helpers ----------

def _split_path(path: str) -> list[tuple[str, int | None]]:
    """'bank_detail.rows[2].confirmation_balance' -> [('bank_detail', None), ('rows', 2), ('confirmation_balance', None)]"""
    parts: list[tuple[str, int | None]] = []
    for seg in path.split("."):
        m = re.match(r"^([^\[]+)(\[(\d+)\])?$", seg)
        if not m:
            continue
        parts.append((m.group(1), int(m.group(3)) if m.group(3) else None))
    return parts


def _patch_paper(paper: ObjectInstance, field_path: str, new_value: Any) -> None:
    """Apply new_value at field_path inside paper.data.sheet_data."""
    data = dict(paper.data or {})
    sheet_data = dict(data.get("sheet_data") or {})

    parts = _split_path(field_path)
    if not parts:
        return

    sheet_code, _ = parts[0]
    sheet = dict(sheet_data.get(sheet_code) or {})
    cursor: Any = sheet
    for i, (key, idx) in enumerate(parts[1:], start=1):
        is_last = i == len(parts) - 1
        if idx is None:
            if is_last:
                cursor[key] = new_value
            else:
                cursor[key] = dict(cursor.get(key) or {})
                cursor = cursor[key]
        else:
            arr = list(cursor.get(key) or [])
            while len(arr) <= idx:
                arr.append({})
            if is_last:
                arr[idx] = new_value
            else:
                arr[idx] = dict(arr[idx] or {})
                cursor[key] = arr
                cursor = arr[idx]
                continue
            cursor[key] = arr

    sheet_data[sheet_code] = sheet
    data["sheet_data"] = sheet_data
    paper.data = data
    paper.updated_at = datetime.utcnow()


def _ai_badge_remove(paper: ObjectInstance, field_path: str) -> None:
    """When a cell is corrected, remove its 'ai_written' badge tracker."""
    data = dict(paper.data or {})
    badges = list(data.get("ai_written_paths") or [])
    if field_path in badges:
        badges.remove(field_path)
        data["ai_written_paths"] = badges
        paper.data = data


# ---------- Endpoints ----------

@router.post("/corrections")
def record_correction(body: CorrectionIn, s: Session = Depends(get_session)) -> dict[str, Any]:
    paper = s.get(ObjectInstance, body.paper_id)
    if not paper or paper.type_code != "WorkingPaper":
        raise HTTPException(404, "paper not found")

    if body.apply_to_paper:
        _patch_paper(paper, body.field_path, body.new_value)
        _ai_badge_remove(paper, body.field_path)
        s.add(paper); s.commit(); s.refresh(paper)

    corr = Correction(
        paper_id=body.paper_id,
        field_path=body.field_path,
        old_value=body.old_value,
        new_value=body.new_value,
        reason_code=body.reason_code,
        reason_text=body.reason_text,
        agent_run_id=body.agent_run_id,
        user=body.user,
    )
    s.add(corr); s.commit(); s.refresh(corr)
    return {"ok": True, "correction_id": corr.id}


@router.get("/corrections")
def list_corrections(
    paper_id: int | None = None,
    s: Session = Depends(get_session),
) -> list[Correction]:
    q = select(Correction).order_by(Correction.created_at.desc())
    if paper_id is not None:
        q = q.where(Correction.paper_id == paper_id)
    return list(s.exec(q).all()[:200])


@router.post("/corrections/{corr_id}/propose")
async def propose_delta(corr_id: int, s: Session = Depends(get_session)) -> ProposeDeltaResponse:
    corr = s.get(Correction, corr_id)
    if not corr:
        raise HTTPException(404, "correction not found")
    paper = s.get(ObjectInstance, corr.paper_id)
    if not paper:
        raise HTTPException(404, "paper for correction not found")

    template_code = (paper.data or {}).get("template_code")
    template = _get_template(s, template_code) if template_code else None

    if is_demo():
        proposal = _demo_propose(corr, paper, template)
    else:
        proposal = await _llm_propose(corr, paper, template)

    if not proposal:
        return ProposeDeltaResponse(has_proposal=False)

    # Compute scope preview (how many papers / templates / firm-wide objects affected)
    proposal["scope_options"] = _build_scope_options(s, proposal, template, corr.paper_id)
    proposal["affected_papers"] = _affected_papers_preview(s, proposal, template)
    return ProposeDeltaResponse(has_proposal=True, **proposal)


@router.post("/ontology-changes/apply")
def apply_change(body: ApplyChangeIn, s: Session = Depends(get_session)) -> dict[str, Any]:
    """Apply a proposed delta with explicit scope.

    Scopes:
      paper    — write change locally on the paper instance only (no ontology mutation).
      template — mutate the PaperTemplate or AuditRule object_instance globally.
      firm     — same as template for v1, but flag for partner review.
    """
    before_snapshot: dict[str, Any] = {}
    delta = body.delta or {}

    if body.target_kind == "PaperTemplate":
        target = _get_template_obj(s, body.target_code)
        if not target:
            raise HTTPException(404, f"template {body.target_code} not found")
        if body.scope == "paper" and body.paper_id:
            paper = s.get(ObjectInstance, body.paper_id)
            if not paper:
                raise HTTPException(404, "paper not found")
            before_snapshot = {"paper_overrides": (paper.data or {}).get("template_overrides", {})}
            _apply_template_delta_local(paper, delta)
            s.add(paper); s.commit(); s.refresh(paper)
        else:
            before_snapshot = {"data": copy.deepcopy(target.data or {})}
            _apply_template_delta_global(target, delta)
            target.updated_at = datetime.utcnow()
            s.add(target); s.commit(); s.refresh(target)

    elif body.target_kind == "AuditRule":
        target = _get_rule_obj(s, body.target_code)
        if not target and body.kind == "rule_new":
            target = ObjectInstance(
                type_code="AuditRule",
                display_name=delta.get("name", body.target_code),
                data={
                    "code": body.target_code,
                    "name": delta.get("name", body.target_code),
                    "category": delta.get("category", "通用"),
                    "expression": delta.get("expression", ""),
                    "severity": delta.get("severity", "medium"),
                    "source": "事务所",
                    "issuer": "审计员修正学习",
                    "effective": datetime.utcnow().strftime("%Y-%m"),
                },
            )
            s.add(target); s.commit(); s.refresh(target)
            before_snapshot = {"created": True}
        elif target:
            before_snapshot = {"data": copy.deepcopy(target.data or {})}
            merged = dict(target.data or {})
            merged.update(delta)
            target.data = merged
            target.updated_at = datetime.utcnow()
            s.add(target); s.commit(); s.refresh(target)
        else:
            raise HTTPException(404, f"rule {body.target_code} not found")

    else:
        raise HTTPException(400, f"unsupported target_kind {body.target_kind}")

    change = OntologyChange(
        kind=body.kind,
        target_kind=body.target_kind,
        target_code=body.target_code,
        scope=body.scope,
        paper_id=body.paper_id,
        delta=delta,
        before_snapshot=before_snapshot,
        summary=body.summary,
        source_correction_id=body.correction_id,
        applied_by=body.applied_by,
    )
    s.add(change); s.commit(); s.refresh(change)

    if body.correction_id:
        corr = s.get(Correction, body.correction_id)
        if corr:
            corr.promoted_change_id = change.id
            s.add(corr); s.commit()

    return {"ok": True, "change_id": change.id}


@router.post("/ontology-changes/{change_id}/rollback")
def rollback_change(change_id: int, s: Session = Depends(get_session)) -> dict[str, Any]:
    change = s.get(OntologyChange, change_id)
    if not change:
        raise HTTPException(404, "change not found")
    if change.rolled_back_at is not None:
        return {"ok": True, "already_rolled_back": True}

    snap = change.before_snapshot or {}

    if change.target_kind == "PaperTemplate":
        if change.scope == "paper" and change.paper_id:
            paper = s.get(ObjectInstance, change.paper_id)
            if paper:
                data = dict(paper.data or {})
                data["template_overrides"] = snap.get("paper_overrides", {})
                paper.data = data
                paper.updated_at = datetime.utcnow()
                s.add(paper); s.commit()
        else:
            target = _get_template_obj(s, change.target_code)
            if target and "data" in snap:
                target.data = snap["data"]
                target.updated_at = datetime.utcnow()
                s.add(target); s.commit()

    elif change.target_kind == "AuditRule":
        target = _get_rule_obj(s, change.target_code)
        if snap.get("created") and target:
            s.delete(target); s.commit()
        elif target and "data" in snap:
            target.data = snap["data"]
            target.updated_at = datetime.utcnow()
            s.add(target); s.commit()

    change.rolled_back_at = datetime.utcnow()
    s.add(change); s.commit(); s.refresh(change)
    return {"ok": True, "rolled_back": True}


@router.get("/ontology-changes")
def list_changes(s: Session = Depends(get_session)) -> list[OntologyChange]:
    return list(s.exec(
        select(OntologyChange).order_by(OntologyChange.applied_at.desc())
    ).all()[:100])


@router.get("/learning-inbox")
def learning_inbox(s: Session = Depends(get_session)) -> list[dict[str, Any]]:
    """Aggregate corrections that haven't been promoted into firm-wide suggestions.

    Grouping key: (paper_template_code, field_path, reason_code, rough new_value bucket).
    Surfaces a suggestion when at least 2 different auditors made the same correction.
    """
    corrections = list(s.exec(
        select(Correction).where(Correction.promoted_change_id == None)  # noqa: E711
        .order_by(Correction.created_at.desc())
    ))
    if not corrections:
        return []

    # We need template_code per paper for grouping
    paper_to_template: dict[int, str] = {}
    paper_to_engagement: dict[int, str] = {}
    for c in corrections:
        if c.paper_id in paper_to_template:
            continue
        paper = s.get(ObjectInstance, c.paper_id)
        if paper:
            paper_to_template[c.paper_id] = (paper.data or {}).get("template_code", "?")
            paper_to_engagement[c.paper_id] = (paper.data or {}).get("engagement_code", "?")

    buckets: dict[tuple[str, str, str], list[Correction]] = defaultdict(list)
    for c in corrections:
        key = (
            paper_to_template.get(c.paper_id, "?"),
            c.field_path.split(".rows[")[0],  # collapse row indices: "bank_detail.rows[3].x" -> "bank_detail"
            c.reason_code,
        )
        buckets[key].append(c)

    out: list[dict[str, Any]] = []
    for (template_code, field_root, reason_code), corrs in buckets.items():
        users = {c.user for c in corrs}
        if len(corrs) < 2 and len(users) < 2:
            continue
        out.append({
            "template_code": template_code,
            "field_root": field_root,
            "reason_code": reason_code,
            "correction_count": len(corrs),
            "auditor_count": len(users),
            "auditors": sorted(users),
            "sample_correction_ids": [c.id for c in corrs[:5]],
            "latest_at": max(c.created_at for c in corrs).isoformat(),
            "suggested_action": _suggest_inbox_action(reason_code, field_root),
        })

    out.sort(key=lambda r: (-r["auditor_count"], -r["correction_count"]))
    return out


# ---------- Helpers ----------

def _get_template(s: Session, code: str) -> dict[str, Any] | None:
    obj = _get_template_obj(s, code)
    return obj.data if obj else None


def _get_template_obj(s: Session, code: str) -> ObjectInstance | None:
    templates = list(s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "PaperTemplate")))
    for t in templates:
        if (t.data or {}).get("code") == code:
            return t
    return None


def _get_rule_obj(s: Session, code: str) -> ObjectInstance | None:
    rules = list(s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "AuditRule")))
    for r in rules:
        if (r.data or {}).get("code") == code:
            return r
    return None


def _apply_template_delta_local(paper: ObjectInstance, delta: dict[str, Any]) -> None:
    """Local override stored on the paper itself, doesn't mutate template."""
    data = dict(paper.data or {})
    overrides = dict(data.get("template_overrides") or {})
    for k, v in delta.items():
        overrides[k] = v
    data["template_overrides"] = overrides
    paper.data = data


def _apply_template_delta_global(template: ObjectInstance, delta: dict[str, Any]) -> None:
    """Mutate the PaperTemplate.data — merges at field_overrides level for transparency."""
    data = dict(template.data or {})

    if "field_source_override" in delta:
        existing = dict(data.get("field_source_overrides") or {})
        existing.update(delta["field_source_override"])
        data["field_source_overrides"] = existing

    if "add_field" in delta:
        sheets = list(data.get("sheets") or [])
        sheet_code = delta["add_field"].get("sheet_code", "summary")
        new_field = delta["add_field"].get("field", {})
        for sh in sheets:
            if sh.get("code") == sheet_code:
                fields = list(sh.get("fields") or [])
                fields.append(new_field)
                sh["fields"] = fields
                break
        data["sheets"] = sheets

    template.data = data


def _build_scope_options(
    s: Session,
    proposal: dict[str, Any],
    template: dict[str, Any] | None,
    current_paper_id: int,
) -> list[dict[str, Any]]:
    template_code = (template or {}).get("code", "")
    affected = 0
    if template_code:
        papers = list(s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "WorkingPaper")))
        affected = sum(1 for p in papers if (p.data or {}).get("template_code") == template_code)

    return [
        {"value": "paper", "label": "仅此底稿", "affected_count": 1, "recommended": True},
        {"value": "template", "label": f"本模板·全部底稿 ({affected})", "affected_count": affected,
         "warning": f"将影响 {affected} 张底稿" if affected > 0 else ""},
        {"value": "firm", "label": "全所推广 (需合伙人审批)", "affected_count": affected,
         "warning": "需走合伙人审批流程"},
    ]


def _affected_papers_preview(
    s: Session,
    proposal: dict[str, Any],
    template: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    template_code = (template or {}).get("code", "")
    if not template_code:
        return []
    papers = list(s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "WorkingPaper")))
    out = []
    for p in papers[:8]:
        if (p.data or {}).get("template_code") != template_code:
            continue
        out.append({
            "id": p.id,
            "display_name": p.display_name,
            "status": (p.data or {}).get("status", "?"),
        })
    return out


def _suggest_inbox_action(reason_code: str, field_root: str) -> str:
    return {
        "source_wrong": f"将「{field_root}」的取数源更新为新映射",
        "rule_misfire": "为相关规则添加例外条件",
        "rule_missed": "新增一条审计规则",
        "field_missing": f"在模板中增加字段 (相关位置：{field_root})",
        "value_wrong": "复核该字段的取数逻辑",
    }.get(reason_code, f"复核「{field_root}」")


# ---------- LLM / demo proposal builders ----------

def _demo_propose(corr: Correction, paper: ObjectInstance, template: dict[str, Any] | None) -> dict[str, Any] | None:
    """Deterministic proposal — picks a plausible delta based on reason_code + field_path."""
    field_root = corr.field_path.split(".")[0]
    field_leaf = corr.field_path.split(".")[-1]
    template_code = (template or {}).get("code", "TPL-CASH-01")

    if corr.reason_code == "source_wrong":
        return {
            "kind": "template_field_source",
            "summary": f"将「{field_leaf}」的取数来源从「1002 银行存款」更新为「1002 + 1012 (其他货币资金)」",
            "target_kind": "PaperTemplate",
            "target_code": template_code,
            "delta": {
                "field_source_override": {
                    field_leaf: {"sources": ["1002", "1012"], "operator": "sum"},
                },
            },
        }

    if corr.reason_code == "rule_misfire":
        return {
            "kind": "rule_exception",
            "summary": "为相关规则增加例外条件：差异 < 100 元时不报异常",
            "target_kind": "AuditRule",
            "target_code": "CASH-RULE-001",
            "delta": {
                "expression_addendum": "AND abs(book_balance - confirmation_balance) >= 100",
                "exception_note": "审计员修正学习：小额差异不报",
            },
        }

    if corr.reason_code == "rule_missed":
        return {
            "kind": "rule_new",
            "summary": "新增一条审计规则：人工识别的异常类型",
            "target_kind": "AuditRule",
            "target_code": f"INTAKE-USER-{abs(hash(corr.field_path)) % 900 + 100}",
            "delta": {
                "name": f"审计员人工识别 · {field_root}",
                "category": "审计员学习",
                "expression": f"在 {field_root} 出现 {corr.new_value} 类情况时提示",
                "severity": "medium",
            },
        }

    if corr.reason_code == "field_missing":
        return {
            "kind": "template_add_field",
            "summary": f"在模板「{field_root}」子表中增加新字段",
            "target_kind": "PaperTemplate",
            "target_code": template_code,
            "delta": {
                "add_field": {
                    "sheet_code": field_root,
                    "field": {
                        "code": f"extra_{abs(hash(corr.field_path)) % 1000:03d}",
                        "label": "新增字段",
                        "type": "string",
                    },
                },
            },
        }

    return None


async def _llm_propose(corr: Correction, paper: ObjectInstance, template: dict[str, Any] | None) -> dict[str, Any] | None:
    """Real LLM proposal. Asks for strict JSON."""
    template_code = (template or {}).get("code", "")
    system = (
        "你是审计本体修正助手。审计员刚刚在底稿上做了一处修正，请你判断这一次修正"
        "是否值得作为本体规则 / 模板的一次升级。如果不值得，返回 null；如果值得，"
        "请按以下 JSON schema 输出（仅 JSON，不要其它文字）：\n"
        '{"kind":"template_field_source"|"template_add_field"|"rule_exception"|"rule_new",'
        '"summary":中文一句话, "target_kind":"PaperTemplate"|"AuditRule", "target_code":string,'
        '"delta":object}'
    )
    payload = {
        "field_path": corr.field_path,
        "old_value": corr.old_value,
        "new_value": corr.new_value,
        "reason_code": corr.reason_code,
        "reason_text": corr.reason_text,
        "template_code": template_code,
        "paper_data": {k: v for k, v in (paper.data or {}).items() if k != "sheet_data"},
    }
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]
    res = await llm_chat(messages, tools=None)
    txt = (res.content or "").strip()
    if txt.startswith("```"):
        txt = txt.strip("` \n")
        if txt.lower().startswith("json"):
            txt = txt[4:].strip()
    try:
        obj = json.loads(txt)
        if isinstance(obj, dict) and obj.get("kind"):
            return obj
    except json.JSONDecodeError:
        pass
    return None
