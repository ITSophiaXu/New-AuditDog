"""Template authoring backend.

Routes:
    POST /api/templates/infer-from-sheet  — 2D cell array -> inferred fields_schema
    POST /api/templates/save              — save inferred (and edited) schema as PaperTemplate
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
from ..models import ObjectInstance
from ..provenance import make_provenance
from ..schemas import TemplateInferIn


router = APIRouter()


@router.post("/templates/infer-from-sheet")
async def infer_from_sheet(body: TemplateInferIn) -> dict[str, Any]:
    rows = body.rows or []
    if not rows:
        raise HTTPException(400, "no rows provided")

    headers, sample_rows = _extract_headers(rows)
    if not headers:
        raise HTTPException(400, "could not detect a header row")

    if is_demo():
        fields = _demo_infer_fields(headers, sample_rows)
        rules = _demo_infer_rules(headers, sample_rows)
    else:
        fields = await _llm_infer_fields(headers, sample_rows)
        rules = await _llm_infer_rules(headers, sample_rows)

    name_guess = _guess_template_name(body.filename, body.sheet_name, headers)
    scenario_guess = _guess_scenario(name_guess, headers)
    code_guess = f"TPL-IMPORTED-{abs(hash(name_guess)) % 9000 + 1000}"

    return {
        "code": code_guess,
        "name": name_guess,
        "scenario": scenario_guess,
        "fields": fields,
        "inferred_rules": rules,
        "demo": is_demo(),
        "stats": {
            "header_count": len(headers),
            "sample_row_count": len(sample_rows),
        },
    }


@router.post("/templates/save")
def save_template(body: dict[str, Any], s: Session = Depends(get_session)) -> dict[str, Any]:
    code = (body.get("code") or "").strip()
    name = (body.get("name") or "").strip()
    if not code or not name:
        raise HTTPException(400, "code and name required")

    # Reject duplicate codes
    existing = list(s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "PaperTemplate")))
    if any((t.data or {}).get("code") == code for t in existing):
        raise HTTPException(400, f"template code {code} already exists")

    today = datetime.utcnow().strftime("%Y-%m-%d")
    prov = make_provenance(
        origin="wizard",
        bundle=f"firm-imported@{datetime.utcnow().strftime('%Y-%m')}",
        version="0.1.0",
        issuer=body.get("issuer") or "Excel 导入向导",
        effective_from=today,
        author=body.get("author") or "intake-wizard",
        status="active",
    )
    data = {
        "code": code,
        "name": name,
        "scenario": body.get("scenario") or "底稿填写",
        "fields": body.get("fields") or [],
        "default_rules": body.get("default_rules") or [],
        "source": "事务所",
        "provenance": prov,
    }
    # If the user has approved inferred rules, save them as separate AuditRule objects
    inferred_rules: list[dict[str, Any]] = body.get("save_rules") or []
    rule_codes_saved: list[str] = []
    for r in inferred_rules:
        rcode = r.get("code") or f"RULE-IMPORT-{abs(hash(r.get('description',''))) % 9000 + 1000}"
        if any((x.data or {}).get("code") == rcode
               for x in s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "AuditRule"))):
            continue
        rule_obj = ObjectInstance(
            type_code="AuditRule",
            display_name=r.get("name") or rcode,
            data={
                "code": rcode,
                "name": r.get("name") or rcode,
                "category": r.get("category") or "通用",
                "expression": r.get("description") or "",
                "severity": r.get("severity") or "medium",
                "source": "事务所",
                "issuer": "Excel 导入推断",
                "effective": datetime.utcnow().strftime("%Y-%m"),
                "provenance": prov,
            },
        )
        s.add(rule_obj); s.commit(); s.refresh(rule_obj)
        rule_codes_saved.append(rcode)

    if rule_codes_saved:
        data["default_rules"] = list({*data.get("default_rules", []), *rule_codes_saved})

    obj = ObjectInstance(type_code="PaperTemplate", display_name=name, data=data)
    s.add(obj); s.commit(); s.refresh(obj)

    return {
        "ok": True,
        "template_id": obj.id,
        "template_code": code,
        "rule_codes_saved": rule_codes_saved,
    }


# ---------- Header / sample extraction ----------

def _extract_headers(rows: list[list[Any]]) -> tuple[list[str], list[list[Any]]]:
    """Pick the first row with mostly non-empty string cells as headers.
    Returns (headers, sample_rows after header)."""
    for i, row in enumerate(rows[:10]):
        non_empty = [c for c in row if c not in (None, "")]
        text_share = sum(1 for c in non_empty if isinstance(c, str)) / max(len(non_empty), 1)
        if len(non_empty) >= 3 and text_share >= 0.5:
            headers = [str(c).strip() if c is not None else "" for c in row]
            sample = rows[i + 1: i + 1 + 8]   # next 8 rows as sample
            return headers, sample
    # Fallback: first row
    if rows:
        return [str(c).strip() if c is not None else "" for c in rows[0]], rows[1:9]
    return [], []


def _guess_template_name(filename: str, sheet_name: str, headers: list[str]) -> str:
    base = filename or sheet_name or "新模板"
    base = re.sub(r"\.(xlsx?|xls|csv)$", "", base, flags=re.IGNORECASE)
    base = re.sub(r"[_\-]+", " ", base).strip()
    if not base:
        if headers and headers[0]:
            base = headers[0]
        else:
            base = "新模板"
    if "底稿" not in base and "模板" not in base:
        base = f"{base} 底稿模板"
    return base[:80]


def _guess_scenario(name: str, headers: list[str]) -> str:
    blob = name + " " + " ".join(headers)
    if any(k in blob for k in ["专项", "政府", "立项"]):
        return "专项审计"
    if any(k in blob for k in ["方案", "总体目标", "重要性"]):
        return "方案生成"
    if any(k in blob for k in ["异常", "舞弊"]):
        return "异常分析"
    return "底稿填写"


# ---------- Demo (deterministic) inference ----------

ACCOUNT_HINTS = [
    ("银行存款", "1001"),
    ("库存现金", "1002"),
    ("应收账款", "1122"),
    ("固定资产", "1601"),
    ("应付账款", "2202"),
    ("主营业务收入", "6001"),
    ("营业收入", "6001"),
    ("库存商品", "1405"),
    ("预付账款", "1123"),
    ("其他货币资金", "1012"),
]


def _demo_infer_fields(headers: list[str], sample: list[list[Any]]) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    for idx, h in enumerate(headers):
        h = (h or "").strip()
        if not h:
            continue
        sample_col = [row[idx] if idx < len(row) else None for row in sample if any(c not in (None, "") for c in row)]
        field_type = _infer_type(h, sample_col)
        source = _infer_source(h)
        fields.append({
            "code": _slugify(h, idx),
            "label": h,
            "type": field_type,
            "source": source,
            "required": any(k in h for k in ["必", "编号", "客户", "项目"]),
            "ai_guess": True,
        })
    return fields


def _demo_infer_rules(headers: list[str], sample: list[list[Any]]) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    labels = [h or "" for h in headers]

    # 1) account balance vs confirmation
    has_book = any("账面" in h for h in labels)
    has_conf = any(("询证" in h or "对账单" in h) for h in labels)
    if has_book and has_conf:
        rules.append({
            "name": "账面余额 与 询证函/对账单 一致",
            "category": _guess_scenario("", labels)[:6] or "货币资金",
            "description": "如果账面余额 与 询证函/对账单 余额不一致，标记为异常",
            "severity": "high",
            "ai_guess": True,
        })

    # 2) required fields not blank
    blanks = [h for h in labels if h and any(k in h for k in ["编号", "客户", "结论"])]
    if blanks:
        rules.append({
            "name": f"必填字段不可为空 ({len(blanks)} 项)",
            "category": "完整性",
            "description": f"以下字段不允许为空：{', '.join(blanks)}",
            "severity": "medium",
            "ai_guess": True,
        })

    # 3) money columns should be non-negative
    money_cols = [h for h in labels if any(k in h for k in ["金额", "余额", "总额"])]
    if money_cols:
        rules.append({
            "name": f"金额字段非负 ({len(money_cols)} 项)",
            "category": "数据质量",
            "description": f"金额字段（{', '.join(money_cols[:3])}{'...' if len(money_cols) > 3 else ''}）不应为负",
            "severity": "low",
            "ai_guess": True,
        })

    return rules


def _infer_type(header: str, sample: list[Any]) -> str:
    if any(k in header for k in ["余额", "金额", "总额", "数额"]):
        return "money"
    if any(k in header for k in ["结论", "说明", "描述", "备注", "情况"]):
        return "text"
    if any(k in header for k in ["日期", "时间", "期"]):
        return "date"
    if any(k in header for k in ["是否", "标记"]):
        return "boolean"
    # detect from sample values
    numeric_count = sum(1 for v in sample if isinstance(v, (int, float)))
    if numeric_count >= len(sample) * 0.5 and len(sample) >= 2:
        return "number"
    return "string"


def _infer_source(header: str) -> dict[str, Any]:
    """Heuristic mapping: header text -> data source (TB account, computed, manual)."""
    for hint, code in ACCOUNT_HINTS:
        if hint in header:
            return {"kind": "tb_account", "account_code": code, "field": "balance",
                    "label": f"试算平衡表 · {code} {hint} 期末余额"}
    if "差" in header or "净" in header:
        return {"kind": "computed", "label": "由公式计算"}
    if any(k in header for k in ["函证", "对账单", "盘点", "实盘"]):
        return {"kind": "evidence", "label": "上传/外部证据"}
    return {"kind": "manual", "label": "手工填写"}


def _slugify(label: str, idx: int) -> str:
    # Stable code from label; falls back to f"col_{idx}"
    safe = re.sub(r"[^a-zA-Z0-9]", "", label)
    if safe:
        return f"f_{abs(hash(label)) % 10000:04d}"
    return f"col_{idx}"


# ---------- LLM inference ----------

async def _llm_infer_fields(headers: list[str], sample: list[list[Any]]) -> list[dict[str, Any]]:
    system = (
        "你是审计底稿设计专家。给定一张 Excel 底稿的列头和样本数据，"
        "为每一列输出一个字段定义。每个字段需包括："
        '{"code":英文小写下划线, "label":中文列名, '
        '"type":"string"|"number"|"money"|"text"|"date"|"boolean", '
        '"required":bool, "source":{"kind":"tb_account"|"computed"|"evidence"|"manual", ...}, '
        '"ai_guess":true}。'
        "对于明显与会计科目相关的列（如 银行存款 / 应收账款 / 库存现金）, 在 source 里给出 account_code。"
        "仅输出 JSON 数组，不要其它文字。"
    )
    payload = {"headers": headers, "sample_rows": sample[:5]}
    res = await llm_chat(
        [{"role": "system", "content": system},
         {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
        tools=None,
    )
    return _parse_json_array(res.content) or _demo_infer_fields(headers, sample)


async def _llm_infer_rules(headers: list[str], sample: list[list[Any]]) -> list[dict[str, Any]]:
    system = (
        "你是审计规则专家。给定一张底稿的列头与样本数据，推断 1-3 条可能适用的校验/审计规则。"
        '每条规则按 {"name":中文, "category":中文, "description":中文一句话规则, '
        '"severity":"low"|"medium"|"high", "ai_guess":true} 输出。仅输出 JSON 数组。'
    )
    payload = {"headers": headers, "sample_rows": sample[:5]}
    res = await llm_chat(
        [{"role": "system", "content": system},
         {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
        tools=None,
    )
    return _parse_json_array(res.content) or _demo_infer_rules(headers, sample)


def _parse_json_array(text: str) -> list[dict[str, Any]] | None:
    txt = (text or "").strip()
    if txt.startswith("```"):
        txt = txt.strip("` \n")
        if txt.lower().startswith("json"):
            txt = txt[4:].strip()
    try:
        data = json.loads(txt)
        return data if isinstance(data, list) else None
    except json.JSONDecodeError:
        return None
