"""Knowledge intake wizard backend.

Two endpoints:

- POST /api/intake/parse   — accepts raw text (paste or file content as text) +
                              an asset_type, returns structured rows ready to save.
                              Demo mode returns deterministic canned rows; with a
                              GITHUB_TOKEN set, calls the LLM for JSON extraction.

- POST /api/intake/save    — takes the structured rows and creates ObjectInstances.

Asset types supported in v1: AuditRule, SpecialAuditCase, PaperTemplate.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from datetime import datetime

from ..db import get_session
from ..llm import is_demo, chat as llm_chat
from ..models import ObjectInstance
from ..provenance import make_provenance, BUNDLE_REGISTRY


router = APIRouter()


@router.get("/bundles")
def list_bundles() -> list[dict[str, Any]]:
    """The catalog of knowledge bundles this instance ships with.

    Used by the Knowledge Center to render the 'subscribed bundles' summary.
    In a production deployment this would come from a marketplace / registry
    table rather than a Python constant."""
    return [
        {"id": bid, **meta}
        for bid, meta in BUNDLE_REGISTRY.items()
    ]


class ParseRequest(BaseModel):
    asset_type: str
    content: str
    filename: str | None = None


class SaveRequest(BaseModel):
    asset_type: str
    rows: list[dict[str, Any]]


@router.post("/intake/parse")
async def parse_intake(body: ParseRequest) -> dict[str, Any]:
    if body.asset_type not in {"AuditRule", "SpecialAuditCase", "PaperTemplate"}:
        raise HTTPException(400, f"unsupported asset_type {body.asset_type}")

    snippet = (body.content or "").strip()
    if not snippet:
        raise HTTPException(400, "content is empty")

    if is_demo():
        rows = _demo_parse(body.asset_type, snippet)
    else:
        rows = await _llm_parse(body.asset_type, snippet)

    return {
        "asset_type": body.asset_type,
        "rows": rows,
        "raw_chars": len(snippet),
        "source_label": body.filename or "粘贴文本",
        "demo": is_demo(),
    }


@router.post("/intake/save")
def save_intake(body: SaveRequest, s: Session = Depends(get_session)) -> dict[str, Any]:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    bundle_id = f"firm-imported@{datetime.utcnow().strftime('%Y-%m')}"
    created: list[int] = []
    for row in body.rows:
        display = (
            row.get("name")
            or row.get("case_no")
            or row.get("code")
            or "(未命名)"
        )
        if body.asset_type == "SpecialAuditCase":
            display = f"{row.get('client_name') or '(未命名客户)'} · {row.get('special_type') or '专项'}"

        # Provenance: intake-wizard imports always land as DRAFT — must be
        # reviewed by a senior auditor before they can be applied to live work.
        prov = make_provenance(
            origin="wizard",
            bundle=bundle_id,
            version="0.1.0",
            issuer=row.get("issuer") or "向导导入",
            effective_from=today,
            author="intake-wizard",
            status="draft",
        )
        obj = ObjectInstance(
            type_code=body.asset_type,
            display_name=display,
            data={**row, "source": row.get("source") or "事务所", "provenance": prov},
        )
        s.add(obj); s.commit(); s.refresh(obj)
        created.append(obj.id)
    return {"ok": True, "created_ids": created, "count": len(created), "bundle": bundle_id}


# ---------- Demo extractors ----------

def _demo_parse(asset_type: str, snippet: str) -> list[dict[str, Any]]:
    """Deterministic mock extraction. Mentions key tokens from the input so the
    auditor can tell the parser at least 'looked' at the text."""
    lower = snippet.lower()
    sample = snippet[:80].replace("\n", " ")

    if asset_type == "AuditRule":
        # Detect category from keywords
        cat = "通用"
        if any(k in snippet for k in ["政府", "财政", "专项资金", "招标", "采购"]):
            cat = "政府专项"
        elif any(k in snippet for k in ["收入", "销售", "截止"]):
            cat = "收入"
        elif any(k in snippet for k in ["关联", "实控人"]):
            cat = "关联交易"
        elif any(k in snippet for k in ["货币", "银行存款", "现金", "盘点"]):
            cat = "货币资金"

        sev = "high" if any(k in lower for k in ["重大", "高", "high", "舞弊", "禁止"]) else "medium"
        return [
            {
                "code": f"INTAKE-{cat[:3].upper()}-{abs(hash(sample)) % 900 + 100}",
                "name": _first_sentence(snippet) or "规则名称（待补全）",
                "category": cat,
                "expression": _trim(snippet, 240),
                "severity": sev,
                "source": "事务所",
                "issuer": "本所内规",
                "effective": "2026-05",
            }
        ]

    if asset_type == "SpecialAuditCase":
        special_type = "其他"
        if any(k in snippet for k in ["政府", "财政", "专项资金"]):
            special_type = "政府专项资金审计"
        elif any(k in snippet for k in ["关联", "实控人", "关联交易"]):
            special_type = "关联交易专项"
        elif any(k in snippet for k in ["商誉", "减值"]):
            special_type = "商誉减值专项"
        elif any(k in snippet for k in ["收入", "舒授", "截止"]):
            special_type = "收入舒授专项"

        return [
            {
                "case_no": f"SPC-INTAKE-{abs(hash(sample)) % 9000 + 1000}",
                "client_name": _guess_client(snippet) or "（待补全）",
                "special_type": special_type,
                "trigger": "上级委托" if "委托" in snippet else "例行",
                "focus_points": _first_paragraph(snippet),
                "period": _guess_period(snippet) or "—",
                "team_size": 4,
                "status": "已完成",
                "plan_sections": {
                    "procedures_count": _count_procedures(snippet),
                    "summary": _trim(snippet, 200),
                },
                "conclusion": _last_paragraph(snippet),
            }
        ]

    if asset_type == "PaperTemplate":
        # Attempt to extract simple "header: value" rows or columns from pasted text
        fields: list[dict[str, Any]] = []
        for line in snippet.splitlines():
            line = line.strip()
            if not line or len(line) > 60:
                continue
            if "：" in line or ":" in line:
                head, _, _rest = line.replace(":", "：").partition("：")
                if head and head not in {f["label"] for f in fields}:
                    fields.append({"code": _pinyin_code(head), "label": head, "type": _guess_type(head)})
            elif len(line) <= 12 and any(k in line for k in ["余额", "金额", "结论", "比率", "数量"]):
                fields.append({"code": _pinyin_code(line), "label": line, "type": _guess_type(line)})

        if not fields:
            fields = [
                {"code": "field_1", "label": "字段一", "type": "string"},
                {"code": "field_2", "label": "字段二", "type": "money"},
                {"code": "audit_conclusion", "label": "审计结论", "type": "text"},
            ]
        return [
            {
                "code": f"TPL-INTAKE-{abs(hash(sample)) % 900 + 100}",
                "name": _first_sentence(snippet) or "新模板",
                "scenario": "底稿填写",
                "fields": fields,
                "default_rules": [],
                "source": "事务所",
            }
        ]

    return []


async def _llm_parse(asset_type: str, snippet: str) -> list[dict[str, Any]]:
    """Real LLM-driven extraction. Asks for strict JSON via system prompt + few-shot."""
    schemas = {
        "AuditRule": '{"code":string,"name":string,"category":string,"expression":string,"severity":"low"|"medium"|"high","source":"公共"|"事务所","issuer":string,"effective":string}',
        "SpecialAuditCase": '{"case_no":string,"client_name":string,"special_type":string,"trigger":string,"focus_points":string,"period":string,"team_size":number,"status":"已完成"|"规划中","plan_sections":object,"conclusion":string}',
        "PaperTemplate": '{"code":string,"name":string,"scenario":string,"fields":[{"code":string,"label":string,"type":"string"|"number"|"money"|"text"|"date"|"enum"|"json"}],"default_rules":[string]}',
    }
    schema = schemas[asset_type]
    system = (
        "你是一名审计领域的结构化数据抽取助手。"
        "请从下面的原文中抽取 1-3 条符合以下 JSON 结构的对象，并仅输出 JSON 数组：\n"
        f"对象结构：{schema}\n"
        "不要输出任何解释文字；如果信息缺失请使用合理的占位符；金额用纯数字。"
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": snippet[:6000]},
    ]
    res = await llm_chat(messages, tools=None)
    txt = (res.content or "").strip()
    # Strip code fences if present
    if txt.startswith("```"):
        txt = txt.strip("` \n")
        if txt.lower().startswith("json"):
            txt = txt[4:].strip()
    try:
        data = json.loads(txt)
        if isinstance(data, dict):
            return [data]
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        pass
    return []


# ---------- Tiny text helpers (demo mode only) ----------

def _trim(s: str, n: int) -> str:
    s = s.strip()
    return s if len(s) <= n else s[:n].rstrip() + "…"


def _first_sentence(s: str) -> str:
    for ch in "。\n!?！？":
        if ch in s:
            return s.split(ch, 1)[0].strip()[:80]
    return s.strip()[:80]


def _first_paragraph(s: str) -> str:
    return _trim(s.split("\n\n", 1)[0].strip(), 360)


def _last_paragraph(s: str) -> str:
    parts = [p for p in s.split("\n\n") if p.strip()]
    return _trim(parts[-1] if parts else s, 240)


def _guess_client(s: str) -> str | None:
    import re
    m = re.search(r"([一-龥A-Za-z0-9]{2,30}(?:股份有限公司|有限公司|集团|银行|事务所|学院|医院))", s)
    return m.group(1) if m else None


def _guess_period(s: str) -> str | None:
    import re
    m = re.search(r"(20\d{2})(?:[\-/年](\d{1,2})月?)?\s*(?:至|到|-)\s*(20\d{2})?(?:[\-/年](\d{1,2})月?)?", s)
    if not m:
        return None
    y1 = m.group(1)
    return f"{y1}-01 至 {m.group(3) or y1}-12"


def _count_procedures(s: str) -> int:
    """Crude heuristic for how many steps the source describes."""
    import re
    nums = re.findall(r"^[\s•·\-]*\d+[\.、]", s, flags=re.MULTILINE)
    return min(max(len(nums), 4), 20)


def _guess_type(label: str) -> str:
    if any(k in label for k in ["余额", "金额", "总额", "数额", "重要性"]):
        return "money"
    if any(k in label for k in ["结论", "说明", "描述"]):
        return "text"
    if any(k in label for k in ["日期", "时间", "期"]):
        return "date"
    return "string"


# A tiny "中文 → 拼音首字母" stub. Generates a stable lowercase code per label.
def _pinyin_code(label: str) -> str:
    h = abs(hash(label)) % 10_000
    return f"field_{h:04d}"
