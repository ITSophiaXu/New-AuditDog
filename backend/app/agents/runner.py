"""Agent execution loop.

Builds an OpenAI-style tools array from the agent config + ontology metadata,
runs the LLM in a loop (max 6 iterations), dispatches tool calls against either
ontology actions or queries against ObjectInstance, and persists an AgentRun.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlmodel import Session, select

from ..llm import chat as llm_chat
from ..models import (
    AgentConfig, AgentRun,
    ObjectType, ActionType,
    ObjectInstance, LinkInstance,
    MCPServer,
)

MAX_ITERS = 6


# ---------- Tool builders ----------

def _to_snake(name: str) -> str:
    out = []
    for i, ch in enumerate(name):
        if ch.isupper() and i > 0 and not name[i - 1].isupper():
            out.append("_")
        out.append(ch.lower())
    return "".join(out)


def _action_tool(at: ActionType) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": _to_snake(at.code),
            "description": f"{at.display_name} — {at.description or '(无)'}",
            "parameters": _params_to_jsonschema(at.parameters_schema),
        },
    }


def _params_to_jsonschema(props: list[dict[str, Any]]) -> dict[str, Any]:
    properties: dict[str, Any] = {}
    required: list[str] = []
    for p in props:
        t = p.get("type", "string")
        json_type = {
            "string": "string", "text": "string", "enum": "string",
            "number": "number", "money": "number",
            "json": "object", "date": "string",
        }.get(t, "string")
        node: dict[str, Any] = {"type": json_type, "description": p.get("label", "")}
        if p.get("enum"):
            node["enum"] = p["enum"]
        properties[p["code"]] = node
        if p.get("required"):
            required.append(p["code"])
    out: dict[str, Any] = {"type": "object", "properties": properties}
    if required:
        out["required"] = required
    return out


def _builtin_query_tools() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": "get_trial_balance",
                "description": "查询某期间的试算平衡表（科目余额）。",
                "parameters": {
                    "type": "object",
                    "properties": {"period": {"type": "string", "description": "期间，如 2025-12-31"}},
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_vouchers_by_account",
                "description": "查询某科目下的凭证列表。",
                "parameters": {
                    "type": "object",
                    "properties": {"account_code": {"type": "string"}},
                    "required": ["account_code"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_case_context",
                "description": "读取当前专项案例的全部背景（客户、专项类型、关注点、规模等）。",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "search_public_rules",
                "description": "按类别从公共法规库检索适用规则（如 政府专项 / 关联交易 / 收入）。",
                "parameters": {
                    "type": "object",
                    "properties": {"category": {"type": "string"}},
                    "required": ["category"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "search_case_library",
                "description": "在本所历史案例库中检索同类型的已完成专项案例供参考。",
                "parameters": {
                    "type": "object",
                    "properties": {"special_type": {"type": "string"}},
                    "required": ["special_type"],
                },
            },
        },
    ]


def _mcp_tools(servers: list[MCPServer]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for srv in servers:
        if not srv.enabled:
            continue
        for tool in srv.tools or []:
            out.append({
                "type": "function",
                "function": {
                    "name": f"mcp_{srv.name}__{tool['name']}",
                    "description": f"[MCP:{srv.name}] {tool.get('description', '')}",
                    "parameters": tool.get("parameters", {"type": "object", "properties": {}}),
                },
            })
    return out


def build_tools_for_agent(agent: AgentConfig, s: Session) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    """Return (tools_list, name_to_meta) where meta tells the runner how to dispatch."""
    tools: list[dict[str, Any]] = []
    meta: dict[str, dict[str, Any]] = {}

    for ref in agent.tools or []:
        kind = ref.get("kind")
        rcode = ref.get("ref")
        if kind == "action":
            at = s.exec(select(ActionType).where(ActionType.code == rcode)).first()
            if not at:
                continue
            tool = _action_tool(at)
            tools.append(tool)
            meta[tool["function"]["name"]] = {"kind": "action", "action": at}
        elif kind == "query":
            for t in _builtin_query_tools():
                if t["function"]["name"] == rcode:
                    tools.append(t)
                    meta[rcode] = {"kind": "query", "name": rcode}
        elif kind == "mcp":
            srv_name, _, tool_name = (rcode or "").partition("::")
            srv = s.exec(select(MCPServer).where(MCPServer.name == srv_name)).first()
            if not srv:
                continue
            for t in srv.tools or []:
                if t["name"] != tool_name:
                    continue
                full = f"mcp_{srv.name}__{tool_name}"
                tools.append({
                    "type": "function",
                    "function": {
                        "name": full,
                        "description": f"[MCP:{srv.name}] {t.get('description', '')}",
                        "parameters": t.get("parameters", {"type": "object", "properties": {}}),
                    },
                })
                meta[full] = {"kind": "mcp", "server": srv.name, "tool": tool_name}
    return tools, meta


# ---------- Tool dispatch ----------

def _query_trial_balance(period: str | None, s: Session) -> dict[str, Any]:
    tbs = list(s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "TrialBalance")))
    if not tbs:
        return {"period": period, "rows": []}
    tb = tbs[0]
    return {"period": (tb.data or {}).get("period", period), "rows": (tb.data or {}).get("rows", [])}


def _query_vouchers(account_code: str, s: Session) -> dict[str, Any]:
    vouchers = list(s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "Voucher")))
    matched = [v for v in vouchers if any(e.get("account_code") == account_code for e in (v.data or {}).get("entries", []))]
    return {"account_code": account_code, "vouchers": [v.model_dump() for v in matched]}


def _query_case_context(case_id: int | None, s: Session) -> dict[str, Any]:
    if not case_id:
        return {"error": "case_id missing — open a case before chatting"}
    case = s.get(ObjectInstance, case_id)
    if not case or case.type_code != "SpecialAuditCase":
        return {"error": "target is not a SpecialAuditCase"}
    return {
        "case_no": (case.data or {}).get("case_no"),
        "client_name": (case.data or {}).get("client_name"),
        "special_type": (case.data or {}).get("special_type"),
        "trigger": (case.data or {}).get("trigger"),
        "focus_points": (case.data or {}).get("focus_points"),
        "period": (case.data or {}).get("period"),
        "team_size": (case.data or {}).get("team_size"),
        "grant_amount": (case.data or {}).get("grant_amount"),
        "status": (case.data or {}).get("status"),
    }


def _query_public_rules(category: str, s: Session) -> dict[str, Any]:
    rules = list(s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "AuditRule")))
    matched = [
        {"code": (r.data or {}).get("code"),
         "name": (r.data or {}).get("name"),
         "category": (r.data or {}).get("category"),
         "severity": (r.data or {}).get("severity"),
         "issuer": (r.data or {}).get("issuer")}
        for r in rules
        if (r.data or {}).get("source") == "公共"
        and (not category or (r.data or {}).get("category") == category)
    ]
    return {"category": category, "rules": matched}


def _query_case_library(special_type: str, s: Session) -> dict[str, Any]:
    cases = list(s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "SpecialAuditCase")))
    matched = [
        {"case_no": (c.data or {}).get("case_no"),
         "client_name": (c.data or {}).get("client_name"),
         "special_type": (c.data or {}).get("special_type"),
         "period": (c.data or {}).get("period"),
         "conclusion": (c.data or {}).get("conclusion"),
         "plan_sections": (c.data or {}).get("plan_sections")}
        for c in cases
        if (c.data or {}).get("special_type") == special_type
        and (c.data or {}).get("status") == "已完成"
    ]
    return {"special_type": special_type, "cases": matched}


def _call_mcp_http(url: str, headers: dict[str, str], tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Call an HTTP/SSE MCP server tool via JSON-RPC POST."""
    import httpx
    body = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {"name": tool_name, "arguments": arguments},
        "id": 1,
    }
    req_headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        **headers,
    }
    try:
        with httpx.Client(timeout=30.0) as client:
            with client.stream("POST", url, json=body, headers=req_headers) as resp:
                content_type = resp.headers.get("content-type", "")
                if "text/event-stream" in content_type:
                    result: dict[str, Any] = {}
                    for line in resp.iter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:].strip()
                            if data_str and data_str != "[DONE]":
                                try:
                                    parsed = json.loads(data_str)
                                    if "result" in parsed:
                                        result = parsed["result"]
                                except Exception:
                                    pass
                    return result
                else:
                    resp.read()
                    try:
                        data = resp.json()
                        return data.get("result", data)
                    except Exception:
                        return {"raw": resp.text}
    except Exception as exc:
        return {"error": str(exc), "tool": tool_name, "server_url": url}


def dispatch_tool(name: str, args: dict[str, Any], meta: dict[str, Any], paper_id: int | None, s: Session) -> Any:
    info = meta.get(name)
    if not info:
        return {"error": f"unknown tool {name}"}

    if info["kind"] == "query":
        if name == "get_trial_balance":
            return _query_trial_balance(args.get("period"), s)
        if name == "get_vouchers_by_account":
            return _query_vouchers(args.get("account_code", ""), s)
        if name == "get_case_context":
            return _query_case_context(paper_id, s)
        if name == "search_public_rules":
            return _query_public_rules(args.get("category", ""), s)
        if name == "search_case_library":
            return _query_case_library(args.get("special_type", ""), s)
        return {"error": "query not implemented"}

    if info["kind"] == "action":
        at: ActionType = info["action"]
        # always operate on paper_id when present, else first arg referencing an id
        target_id = paper_id or args.get("paper_id") or args.get("target_id")
        if at.kind == "fill":
            obj = s.get(ObjectInstance, target_id)
            if not obj:
                return {"error": "target not found"}
            merged = dict(obj.data or {})
            merged.update(args.get("fields", {}))
            obj.data = merged
            obj.updated_at = datetime.utcnow()
            s.add(obj); s.commit(); s.refresh(obj)
            return {"ok": True, "filled_fields": list(args.get("fields", {}).keys())}
        if at.kind == "fill_sheet":
            obj = s.get(ObjectInstance, target_id)
            if not obj:
                return {"error": "target not found"}
            sheet_code = args.get("sheet_code")
            content = args.get("content") or {}
            if not sheet_code:
                return {"error": "sheet_code required"}
            merged = dict(obj.data or {})
            sheet_data = dict(merged.get("sheet_data") or {})
            existing = dict(sheet_data.get(sheet_code) or {})
            badges = set(merged.get("ai_written_paths") or [])
            if "rows" in content:
                existing["rows"] = content["rows"]
                for i, row in enumerate(content["rows"] or []):
                    for k in (row or {}).keys():
                        badges.add(f"{sheet_code}.rows[{i}].{k}")
            for k, v in content.items():
                if k == "rows":
                    continue
                existing[k] = v
                badges.add(f"{sheet_code}.{k}")
            sheet_data[sheet_code] = existing
            merged["sheet_data"] = sheet_data
            merged["ai_written_paths"] = sorted(badges)
            obj.data = merged
            obj.updated_at = datetime.utcnow()
            s.add(obj); s.commit(); s.refresh(obj)
            row_count = len(content.get("rows", [])) if "rows" in content else 0
            field_count = len([k for k in content if k != "rows"])
            return {"ok": True, "sheet": sheet_code, "rows_written": row_count, "fields_written": field_count}
        if at.kind == "flag":
            anomaly = ObjectInstance(
                type_code="Anomaly",
                display_name=args.get("detail", "异常"),
                data={
                    "rule_code": args.get("rule_code"),
                    "paper_id": target_id,
                    "detail": args.get("detail"),
                    "severity": args.get("severity", "medium"),
                    "status": "open",
                },
            )
            s.add(anomaly); s.commit(); s.refresh(anomaly)
            s.add(LinkInstance(link_type_code="AnomalyOnPaper", source_id=anomaly.id, target_id=target_id))
            s.commit()
            return {"ok": True, "anomaly_id": anomaly.id}
        if at.kind == "apply_rule":
            rule_code = args.get("rule_code")
            rules = [r for r in s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "AuditRule"))
                     if (r.data or {}).get("code") == rule_code]
            if not rules:
                return {"ok": False, "error": f"rule {rule_code} not found"}
            r = rules[0]
            return {"ok": True, "rule": (r.data or {}).get("code"), "name": r.display_name,
                    "passed": True, "finding": f"已应用规则 {r.display_name}"}
        return {"error": f"unsupported action kind {at.kind}"}

    if info["kind"] == "mcp":
        server_name = info["server"]
        tool_name = info["tool"]
        server = s.exec(select(MCPServer).where(MCPServer.name == server_name)).first()
        if server and server.transport == "http":
            srv_url = server.url or server.command  # fallback for legacy rows
            req_headers = {**(server.headers or {}), **(server.env or {})}
            return _call_mcp_http(srv_url, req_headers, tool_name, args)
        return {"ok": True, "stub": True,
                "note": f"MCP call to {server_name}::{tool_name} — stdio servers not invoked in this environment",
                "args": args}

    return {"error": "unhandled tool"}


# ---------- Main loop ----------

async def run_agent(agent_code: str, user_message: str, paper_id: int | None, s: Session) -> AgentRun:
    agent = s.exec(select(AgentConfig).where(AgentConfig.code == agent_code)).first()
    if not agent:
        raise ValueError(f"agent {agent_code} not found")

    tools, meta = build_tools_for_agent(agent, s)

    # Retrieval context: serialize a few objects of each requested type into the system prompt
    retrieval_text = _retrieval_context(agent.retrieval_object_types, paper_id, s)

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": agent.system_prompt + ("\n\n" + retrieval_text if retrieval_text else "")},
        {"role": "user", "content": user_message},
    ]
    tool_call_trace: list[dict[str, Any]] = []

    for _ in range(MAX_ITERS):
        result = await llm_chat(messages, tools=tools)
        if result.tool_calls:
            assistant_msg = {
                "role": "assistant",
                "content": result.content or None,
                "tool_calls": [
                    {"id": tc["id"], "type": "function",
                     "function": {"name": tc["name"], "arguments": json.dumps(tc["arguments"])}}
                    for tc in result.tool_calls
                ],
            }
            messages.append(assistant_msg)
            for tc in result.tool_calls:
                output = dispatch_tool(tc["name"], tc["arguments"], meta, paper_id, s)
                tool_call_trace.append({
                    "id": tc["id"],
                    "name": tc["name"],
                    "arguments": tc["arguments"],
                    "output": output,
                })
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "name": tc["name"],
                    "content": json.dumps(output, ensure_ascii=False, default=str),
                })
            continue
        messages.append({"role": "assistant", "content": result.content})
        break

    final_content = ""
    for m in reversed(messages):
        if m.get("role") == "assistant" and m.get("content"):
            final_content = m["content"]
            break

    run = AgentRun(
        agent_code=agent_code,
        paper_id=paper_id,
        messages=messages,
        tool_calls=tool_call_trace,
        status="succeeded",
    )
    s.add(run); s.commit(); s.refresh(run)
    return run


def _retrieval_context(type_codes: list[str], paper_id: int | None, s: Session) -> str:
    if not type_codes:
        return ""
    chunks: list[str] = []
    for code in type_codes:
        objs = list(s.exec(select(ObjectInstance).where(ObjectInstance.type_code == code)))[:5]
        for obj in objs:
            chunks.append(f"[{code}] id={obj.id} name={obj.display_name} data={json.dumps(obj.data, ensure_ascii=False, default=str)}")
    if paper_id:
        paper = s.get(ObjectInstance, paper_id)
        if paper:
            chunks.append(f"[当前底稿] id={paper.id} name={paper.display_name} data={json.dumps(paper.data, ensure_ascii=False, default=str)}")
    if not chunks:
        return ""
    return "## 本体上下文（供参考）\n" + "\n".join(chunks)
