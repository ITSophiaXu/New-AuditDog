"""Agent config CRUD + chat endpoint."""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..llm import is_demo, chat as llm_chat
from ..models import AgentConfig, AgentRun, ActionType
from ..schemas import AgentConfigIn, ChatRequest, AgentForkIn, AgentEditPreviewIn
from . import runner

router = APIRouter()


# Business-name labels for the tool picker — backend identifiers stay English,
# but auditors see Chinese names. Falls back to the ActionType.display_name.
TOOL_BUSINESS_NAMES: dict[str, str] = {
    "get_trial_balance": "查试算平衡表",
    "get_vouchers_by_account": "查科目凭证",
    "get_case_context": "读取本案背景",
    "search_public_rules": "检索公共法规",
    "search_case_library": "检索历史案例",
    "FillWorkingPaper": "填写底稿字段",
    "FillSheet": "填写底稿子表",
    "FlagAnomaly": "标记异常",
    "ApplyRule": "应用审计规则",
    "AttachEvidence": "附加证据",
    "DraftAuditPlan": "起草审计方案",
}


@router.get("/agents")
def list_agents(s: Session = Depends(get_session)) -> list[AgentConfig]:
    return list(s.exec(select(AgentConfig).order_by(AgentConfig.id)))


@router.get("/agents/{code}")
def get_agent(code: str, s: Session = Depends(get_session)) -> AgentConfig:
    a = s.exec(select(AgentConfig).where(AgentConfig.code == code)).first()
    if not a:
        raise HTTPException(404, "not found")
    return a


@router.post("/agents")
def create_agent(body: AgentConfigIn, s: Session = Depends(get_session)) -> AgentConfig:
    if s.exec(select(AgentConfig).where(AgentConfig.code == body.code)).first():
        raise HTTPException(400, "code already exists")
    a = AgentConfig(**body.model_dump())
    s.add(a); s.commit(); s.refresh(a)
    return a


@router.put("/agents/{code}")
def update_agent(code: str, body: AgentConfigIn, s: Session = Depends(get_session)) -> AgentConfig:
    a = s.exec(select(AgentConfig).where(AgentConfig.code == code)).first()
    if not a:
        raise HTTPException(404, "not found")
    a.name = body.name
    a.description = body.description
    a.scenario = body.scenario
    a.avatar = body.avatar
    a.system_prompt = body.system_prompt
    a.tools = body.tools
    a.retrieval_object_types = body.retrieval_object_types
    s.add(a); s.commit(); s.refresh(a)
    return a


@router.get("/agents/{code}/runs")
def list_runs(code: str, s: Session = Depends(get_session)) -> list[AgentRun]:
    return list(s.exec(
        select(AgentRun).where(AgentRun.agent_code == code).order_by(AgentRun.id.desc())
    ).all()[:20])


@router.post("/agents/{code}/chat")
async def chat(code: str, body: ChatRequest, s: Session = Depends(get_session)) -> dict[str, Any]:
    run = await runner.run_agent(code, body.message, body.paper_id, s)
    final = ""
    for m in reversed(run.messages or []):
        if m.get("role") == "assistant" and m.get("content"):
            final = m["content"]
            break
    return {
        "run_id": run.id,
        "final_message": final,
        "tool_calls": run.tool_calls,
    }


# ---------- Tool catalog (business-name) ----------

@router.get("/agent-tools/catalog")
def tool_catalog(s: Session = Depends(get_session)) -> list[dict[str, Any]]:
    """Returns all tools an auditor can attach to an agent, with Chinese business names.
    Used by the Agent Studio's tool picker so users don't see raw method signatures."""
    out: list[dict[str, Any]] = []

    # Built-in query tools
    builtin_queries = [
        ("get_trial_balance", "查试算平衡表", "读取本期 TB 全部科目余额"),
        ("get_vouchers_by_account", "查科目凭证", "按科目编号检索凭证列表"),
        ("get_case_context", "读取本案背景", "读取当前专项案例的完整背景信息"),
        ("search_public_rules", "检索公共法规", "按类别在公共法规库中检索规则"),
        ("search_case_library", "检索历史案例", "在本所案例库中查询同类案例供参考"),
    ]
    for code, label, desc in builtin_queries:
        out.append({
            "kind": "query",
            "ref": code,
            "business_name": label,
            "description": desc,
            "raw_name": code,
        })

    # Action tools (from ActionType table)
    for at in s.exec(select(ActionType).order_by(ActionType.id)):
        out.append({
            "kind": "action",
            "ref": at.code,
            "business_name": TOOL_BUSINESS_NAMES.get(at.code, at.display_name),
            "description": at.description or at.display_name,
            "raw_name": at.code,
        })

    return out


# ---------- Fork / NL edit ----------

@router.post("/agents/fork")
async def fork_agent(body: AgentForkIn, s: Session = Depends(get_session)) -> AgentConfig:
    src = s.exec(select(AgentConfig).where(AgentConfig.code == body.source_code)).first()
    if not src:
        raise HTTPException(404, "source agent not found")
    if s.exec(select(AgentConfig).where(AgentConfig.code == body.new_code)).first():
        raise HTTPException(400, "new_code already in use")

    new_prompt = src.system_prompt
    new_tools = list(src.tools or [])
    new_description = src.description

    if body.change_description.strip():
        if is_demo():
            edits = _demo_edit_agent(src, body.change_description)
        else:
            edits = await _llm_edit_agent(src, body.change_description)
        new_prompt = edits.get("system_prompt", new_prompt)
        new_tools = edits.get("tools", new_tools)
        new_description = edits.get("description", new_description)

    cloned = AgentConfig(
        code=body.new_code,
        name=body.new_name,
        description=new_description,
        scenario=src.scenario,
        avatar=src.avatar,
        system_prompt=new_prompt,
        tools=new_tools,
        retrieval_object_types=list(src.retrieval_object_types or []),
        is_seed=False,
        is_stub=False,
    )
    s.add(cloned); s.commit(); s.refresh(cloned)
    return cloned


@router.post("/agents/preview-edit")
async def preview_edit_agent(body: AgentEditPreviewIn, s: Session = Depends(get_session)) -> dict[str, Any]:
    base = s.exec(select(AgentConfig).where(AgentConfig.code == body.base_code)).first()
    if not base:
        raise HTTPException(404, "base agent not found")
    if is_demo():
        edits = _demo_edit_agent(base, body.change_description)
    else:
        edits = await _llm_edit_agent(base, body.change_description)
    return {"base": base, "edits": edits}


# ---------- Edit helpers ----------

def _demo_edit_agent(base: AgentConfig, change_description: str) -> dict[str, Any]:
    desc = change_description.strip()
    new_prompt = (base.system_prompt or "")
    new_tools = list(base.tools or [])
    new_description = base.description or ""

    if not new_prompt.endswith("\n"):
        new_prompt += "\n"
    new_prompt += f"\n【按审计员要求新增】{desc}"

    # Heuristic tool additions based on Chinese keywords
    desc_blob = desc
    additions: list[dict[str, Any]] = []
    if any(k in desc_blob for k in ["外币", "汇率"]):
        new_prompt += "\n注意对外币账户额外检查汇率折算与减值。"
        new_description += " (外币 / 汇率)"
    if any(k in desc_blob for k in ["函证", "对账"]):
        additions.append({"kind": "action", "ref": "AttachEvidence"})
    if any(k in desc_blob for k in ["凭证", "记账"]):
        additions.append({"kind": "query", "ref": "get_vouchers_by_account"})
    for add in additions:
        if not any(t.get("kind") == add["kind"] and t.get("ref") == add["ref"] for t in new_tools):
            new_tools.append(add)

    return {
        "system_prompt": new_prompt,
        "tools": new_tools,
        "description": new_description.strip(),
        "added_tool_refs": [a["ref"] for a in additions],
        "change_note": desc,
    }


async def _llm_edit_agent(base: AgentConfig, change_description: str) -> dict[str, Any]:
    system = (
        "你正在修改一个审计智能体的配置。基于审计员的中文描述，给出修改后的 JSON："
        '{"system_prompt":string,"tools":[{"kind":"query"|"action"|"mcp","ref":string}],'
        '"description":string,"added_tool_refs":[string],"change_note":string}。'
        "仅输出 JSON。"
    )
    user = json.dumps({
        "agent_name": base.name,
        "agent_description": base.description,
        "current_system_prompt": base.system_prompt,
        "current_tools": base.tools,
        "change_description": change_description,
    }, ensure_ascii=False)
    res = await llm_chat(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        tools=None,
    )
    txt = (res.content or "").strip()
    if txt.startswith("```"):
        txt = txt.strip("` \n")
        if txt.lower().startswith("json"):
            txt = txt[4:].strip()
    try:
        obj = json.loads(txt)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    return _demo_edit_agent(base, change_description)
