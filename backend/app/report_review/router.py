"""报告复核 HTTP 接口.

Endpoints:
  GET  /api/report-review/checklist          — 默认复核清单（文字）
  POST /api/report-review/run                — 上传报告 + 复核要求 → 执行复核 → 存库 → 返回结果
  GET  /api/report-review/reviews            — 历史复核列表
  GET  /api/report-review/reviews/{id}       — 单次复核完整结果（含原文 blocks + findings）
  DELETE /api/report-review/reviews/{id}     — 删除一次复核
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlmodel import Session, select

from ..db import get_session
from ..models import ObjectInstance
from ..llm import is_demo
from .extract import parse_upload, read_instruction_file
from .review import DEFAULT_CHECKLIST, run_review

router = APIRouter(prefix="/api/report-review", tags=["report-review"])

REVIEW_TYPE = "ReportReview"
MAX_FILES = 12
MAX_FILE_BYTES = 25 * 1024 * 1024   # 25 MB / 文件


@router.get("/checklist")
def get_default_checklist() -> dict:
    """返回默认复核清单，前端预填到文本框。"""
    return {"checklist": DEFAULT_CHECKLIST}


@router.post("/run")
async def run(
    files: list[UploadFile] = File(..., description="待复核报告，可多文件 (.docx/.xlsx/.xlsm/.md/.txt)"),
    instruction: str = Form("", description="复核要求（文字）"),
    instruction_file: UploadFile | None = File(None, description="复核要求文档 (.md/.txt/.docx)"),
    title: str = Form("", description="本次复核标题/项目名"),
    s: Session = Depends(get_session),
) -> dict:
    if not files:
        raise HTTPException(400, "请至少上传一个待复核文件")
    if len(files) > MAX_FILES:
        raise HTTPException(400, f"一次最多上传 {MAX_FILES} 个文件")

    # ── 解析上传文件 ──
    docs = []
    for up in files:
        raw = await up.read()
        if len(raw) > MAX_FILE_BYTES:
            raise HTTPException(400, f"文件 {up.filename} 超过 25MB 限制")
        # 忽略 Office 临时文件 ~$xxx
        if (up.filename or "").startswith("~$"):
            continue
        file_id = uuid.uuid4().hex[:10]
        docs.append(parse_upload(file_id, up.filename or "未命名", raw))

    if not docs:
        raise HTTPException(400, "未能解析任何有效文件")

    # ── 组合复核要求：文字 + 上传文档 ──
    checklist_parts: list[str] = []
    if instruction and instruction.strip():
        checklist_parts.append(instruction.strip())
    if instruction_file is not None:
        ir = await instruction_file.read()
        if ir:
            txt = read_instruction_file(instruction_file.filename or "instruction", ir)
            if txt.strip():
                checklist_parts.append(txt.strip())
    checklist = "\n\n".join(checklist_parts) if checklist_parts else DEFAULT_CHECKLIST

    # ── 执行复核 ──
    result = await run_review(docs, checklist)

    # ── 存库（复用 ObjectInstance，type_code=ReportReview）──
    auto_title = title.strip() or _guess_title(docs)
    payload: dict[str, Any] = {
        "title": auto_title,
        "created_at": datetime.utcnow().isoformat(),
        "demo": result["demo"],
        "checklist": checklist,
        "summary": result["summary"],
        "findings": result["findings"],
        "case_study": result.get("case_study", False),
        "review_procedures": result.get("review_procedures", []),
        "finding_groups": result.get("finding_groups", []),
        "artifacts": result.get("artifacts", []),
        "limitations": result.get("limitations", []),
        "quality_note": result.get("quality_note", ""),
        "files": [d.to_dict() for d in docs],     # 原文 blocks 一并存，前端可定位
        "file_meta": [
            {"file_id": d.file_id, "filename": d.filename, "kind": d.kind,
             "block_count": len(d.blocks), "note": d.note}
            for d in docs
        ],
    }
    inst = ObjectInstance(
        type_code=REVIEW_TYPE,
        display_name=auto_title,
        data=payload,
    )
    s.add(inst)
    s.commit()
    s.refresh(inst)

    return {"id": inst.id, **payload}


@router.get("/reviews")
def list_reviews(s: Session = Depends(get_session)) -> list[dict]:
    rows = s.exec(
        select(ObjectInstance).where(ObjectInstance.type_code == REVIEW_TYPE)
    ).all()
    out = []
    for r in rows:
        d = r.data or {}
        findings = d.get("findings", [])
        out.append({
            "id": r.id,
            "title": d.get("title") or r.display_name,
            "created_at": d.get("created_at"),
            "demo": d.get("demo", False),
            "summary": (d.get("summary") or "")[:160],
            "file_count": len(d.get("file_meta", [])),
            "finding_count": len(findings),
            "high_count": sum(1 for f in findings if f.get("severity") == "high"),
        })
    out.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return out


@router.get("/reviews/{review_id}")
def get_review(review_id: int, s: Session = Depends(get_session)) -> dict:
    r = s.get(ObjectInstance, review_id)
    if not r or r.type_code != REVIEW_TYPE:
        raise HTTPException(404, f"复核记录 {review_id} 不存在")
    return {"id": r.id, **(r.data or {})}


@router.patch("/reviews/{review_id}/findings/{finding_id}")
def update_finding_status(
    review_id: int, finding_id: str, body: dict, s: Session = Depends(get_session)
) -> dict:
    """审计师标记某条意见状态：open / resolved / dismissed。"""
    r = s.get(ObjectInstance, review_id)
    if not r or r.type_code != REVIEW_TYPE:
        raise HTTPException(404, f"复核记录 {review_id} 不存在")
    status = body.get("status", "open")
    data = dict(r.data or {})
    findings = data.get("findings", [])
    hit = False
    for f in findings:
        if f.get("id") == finding_id:
            f["status"] = status
            hit = True
            break
    if not hit:
        raise HTTPException(404, f"意见 {finding_id} 不存在")
    data["findings"] = findings
    r.data = data
    r.updated_at = datetime.utcnow()
    s.add(r)
    s.commit()
    return {"ok": True, "finding_id": finding_id, "status": status}


@router.delete("/reviews/{review_id}")
def delete_review(review_id: int, s: Session = Depends(get_session)) -> dict:
    r = s.get(ObjectInstance, review_id)
    if not r or r.type_code != REVIEW_TYPE:
        raise HTTPException(404, f"复核记录 {review_id} 不存在")
    s.delete(r)
    s.commit()
    return {"ok": True, "deleted": review_id}


def _guess_title(docs) -> str:
    """从文件名猜一个项目名（取最像'XX有限公司'的）。"""
    import re
    for d in docs:
        m = re.search(r"[\u4e00-\u9fa5]{2,}(有限公司|公司|事务所|集团)", d.filename)
        if m:
            return m.group(0)
    return f"报告复核 {datetime.now().strftime('%m-%d %H:%M')}"
