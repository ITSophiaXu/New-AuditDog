"""GitHub Models inference client (OpenAI-compatible).

If GITHUB_TOKEN is unset we run in DEMO mode and emit a deterministic, scripted
tool-call trace for the 货币资金 working-paper fill flow. This lets the prototype
be exercised end-to-end without an LLM provider configured.
"""
from __future__ import annotations

import os
import json
from typing import Any
from dataclasses import dataclass

import httpx

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
MODEL_ID = os.environ.get("MODEL_ID", "openai/gpt-4o").strip()
BASE_URL = os.environ.get("GITHUB_MODELS_BASE_URL", "https://models.github.ai/inference").rstrip("/")

DEMO_MODE = not GITHUB_TOKEN


@dataclass
class LLMResult:
    content: str
    tool_calls: list[dict[str, Any]]    # [{id, name, arguments}]


def is_demo() -> bool:
    return DEMO_MODE


async def chat(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    model: str | None = None,
) -> LLMResult:
    """Single round-trip chat completion with optional tool use."""
    if DEMO_MODE:
        return _demo_response(messages, tools or [])

    payload: dict[str, Any] = {
        "model": model or MODEL_ID,
        "messages": messages,
        "temperature": 0.2,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {GITHUB_TOKEN}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        r.raise_for_status()
        body = r.json()

    msg = body["choices"][0]["message"]
    content = msg.get("content") or ""
    raw_tool_calls = msg.get("tool_calls") or []
    parsed: list[dict[str, Any]] = []
    for tc in raw_tool_calls:
        fn = tc.get("function", {})
        try:
            args = json.loads(fn.get("arguments") or "{}")
        except json.JSONDecodeError:
            args = {}
        parsed.append({"id": tc.get("id"), "name": fn.get("name"), "arguments": args})
    return LLMResult(content=content, tool_calls=parsed)


# ---------- Demo-mode scripted response ----------

def _demo_response(messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> LLMResult:
    """Pretend to be an LLM. Routes to a scenario-specific script based on which tools
    are exposed. Currently scripted: 货币资金 fill agent, 专项审计 plan generator."""
    tool_names = {t["function"]["name"] for t in tools} if tools else set()

    if "draft_audit_plan" in tool_names or "get_case_context" in tool_names:
        return _demo_special_audit(messages, tool_names)
    return _demo_cash_paper(messages, tool_names)


# ---------- 货币资金 demo (multi-sheet A1) ----------

def _demo_cash_paper(messages: list[dict[str, Any]], tool_names: set[str]) -> LLMResult:
    has_tool_results = any(m.get("role") == "tool" for m in messages)

    # Round 1: read TB + vouchers
    if not has_tool_results and tool_names:
        calls: list[dict[str, Any]] = []
        if "get_trial_balance" in tool_names:
            calls.append({"id": "call_tb", "name": "get_trial_balance",
                          "arguments": {"period": "2025-12-31"}})
        if "get_vouchers_by_account" in tool_names:
            calls.append({"id": "call_v", "name": "get_vouchers_by_account",
                          "arguments": {"account_code": "1001"}})
        if calls:
            return LLMResult(content="", tool_calls=calls)

    # Round 2: fill bank_detail
    if "fill_sheet" in tool_names and not _has_sheet_fill(messages, "bank_detail"):
        return LLMResult(content="", tool_calls=[{
            "id": "call_bank", "name": "fill_sheet",
            "arguments": {
                "sheet_code": "bank_detail",
                "content": {"rows": [
                    {"bank_name": "工商银行 凯旋路支行", "account_no": "1202 0011 0890 0123456",
                     "currency": "CNY", "book_balance": 982341.18,
                     "confirmation_balance": 982341.18, "is_anomaly": False, "note": ""},
                    {"bank_name": "招商银行 滨江支行", "account_no": "5712 8810 1990 8801",
                     "currency": "CNY", "book_balance": 248752.09,
                     "confirmation_balance": 248752.09, "is_anomaly": False, "note": ""},
                    {"bank_name": "建设银行 文一西路支行", "account_no": "3300 1620 5060 5340 1124",
                     "currency": "CNY", "book_balance": 53500.00,
                     "confirmation_balance": 53500.00, "is_anomaly": False, "note": ""},
                ]},
            },
        }])

    # Round 3: fill cash_count
    if "fill_sheet" in tool_names and not _has_sheet_fill(messages, "cash_count"):
        return LLMResult(content="", tool_calls=[{
            "id": "call_cash", "name": "fill_sheet",
            "arguments": {
                "sheet_code": "cash_count",
                "content": {"rows": [
                    {"count_date": "2025-12-31", "location": "财务室保险柜", "currency": "CNY",
                     "book_amount": 8520.00, "physical_amount": 8520.00,
                     "counter": "张涛 / 王明远", "note": "盘点表已签字"},
                ]},
            },
        }])

    # Round 4: fill cutoff_test (with one anomaly)
    if "fill_sheet" in tool_names and not _has_sheet_fill(messages, "cutoff_test"):
        return LLMResult(content="", tool_calls=[{
            "id": "call_cutoff", "name": "fill_sheet",
            "arguments": {
                "sheet_code": "cutoff_test",
                "content": {"rows": [
                    {"voucher_no": "记-2025-1208", "voucher_date": "2025-12-08",
                     "summary": "收到客户回款", "amount": 320000.00,
                     "should_belong_to": "本期", "is_proper": True, "note": ""},
                    {"voucher_no": "记-2025-1217", "voucher_date": "2025-12-17",
                     "summary": "支付供应商货款", "amount": 180000.00,
                     "should_belong_to": "本期", "is_proper": True, "note": ""},
                    {"voucher_no": "记-2026-0103", "voucher_date": "2026-01-03",
                     "summary": "12 月已发货，1 月入账", "amount": 95000.00,
                     "should_belong_to": "下期", "is_proper": False,
                     "note": "跨期收入凭证 — 已建议调整至 2025 本期"},
                ]},
            },
        }])

    # Round 5: fill summary
    if "fill_sheet" in tool_names and not _has_sheet_fill(messages, "summary"):
        return LLMResult(content="", tool_calls=[{
            "id": "call_summary", "name": "fill_sheet",
            "arguments": {
                "sheet_code": "summary",
                "content": {
                    "tb_balance": 1293113.27,
                    "currency": "CNY",
                    "audit_conclusion": (
                        "银行存款账面 ¥1,284,593.27 与三家银行询证函回函完全一致；"
                        "库存现金盘点 ¥8,520.00 与账面相符。"
                        "截止性测试发现 1 笔跨期凭证（记-2026-0103），建议管理层调整至 2025 本期。"
                        "其余未发现重大异常。"
                    ),
                },
            },
        }])

    # Round 6: apply rules
    if "apply_rule" in tool_names and not _has_called(messages, "apply_rule"):
        return LLMResult(content="", tool_calls=[
            {"id": "call_rule_1", "name": "apply_rule", "arguments": {"rule_code": "CASH-RULE-001"}},
            {"id": "call_rule_2", "name": "apply_rule", "arguments": {"rule_code": "CASH-RULE-002"}},
        ])

    summary = (
        "已完成「A1 货币资金」底稿四个子表的填写：\n"
        "• A1-2 银行存款明细：3 个银行账户，账面 ¥1,284,593.27 — 三笔询证函回函全部一致\n"
        "• A1-3 库存现金盘点：财务室保险柜 ¥8,520.00 — 账实相符（已签字）\n"
        "• A1-4 截止性测试：3 笔凭证抽查，识别 1 笔跨期收入（记-2026-0103, ¥95,000）建议调整\n"
        "• A1-1 主表：账面合计 ¥1,293,113.27 与 TB（1001 + 1002）一致\n"
        "已应用 CASH-RULE-001（一致性）和 CASH-RULE-002（大额异常）— 均通过。\n"
        "请在右侧逐子表复核，并对截止性测试中的跨期凭证签字确认。"
    )
    return LLMResult(content=summary, tool_calls=[])


def _has_sheet_fill(messages: list[dict[str, Any]], sheet_code: str) -> bool:
    """Did any prior assistant message call fill_sheet for this sheet?"""
    import json as _json
    for m in messages:
        if m.get("role") != "assistant":
            continue
        for tc in m.get("tool_calls") or []:
            fn = tc.get("function") or {}
            if fn.get("name") != "fill_sheet":
                continue
            try:
                args = _json.loads(fn.get("arguments") or "{}")
            except _json.JSONDecodeError:
                continue
            if args.get("sheet_code") == sheet_code:
                return True
    return False


# ---------- 专项审计 plan-generator demo ----------

def _demo_special_audit(messages: list[dict[str, Any]], tool_names: set[str]) -> LLMResult:
    has_tool_results = any(m.get("role") == "tool" for m in messages)

    if not has_tool_results:
        return LLMResult(content="", tool_calls=[
            {"id": "call_ctx", "name": "get_case_context", "arguments": {}},
            {"id": "call_pub", "name": "search_public_rules", "arguments": {"category": "政府专项"}},
            {"id": "call_lib", "name": "search_case_library", "arguments": {"special_type": "政府专项资金审计"}},
        ])

    if "draft_audit_plan" in tool_names and not _has_called(messages, "draft_audit_plan"):
        plan_sections = {
            "objectives": (
                "对市数字经济发展局拨付的「智慧城市新基建」专项资金 8,500 万元 2024 全年的拨付、"
                "使用、绩效进行专项审计；核实政府采购程序合规性、工程支出真实性、关联方识别完整性，"
                "并对节余资金处理出具明确结论。"
            ),
            "materiality": 500000,
            "materiality_basis": "按专项资金总额的 0.6% 设定，遵循财政部专项审计指引。",
            "sampling": (
                "重要单笔 ≥ 200,000 元全选 (PPS 100%)；其余按 PPS 抽样 40 笔，覆盖率不低于专项支出的 65%；"
                "招标类支出按金额前 20% 全选。"
            ),
            "kams": [
                {"code": "KAM-1", "title": "专项资金专款专用核查",
                 "description": "比对专项账户进出与立项批复用途，识别任何挪用迹象。",
                 "rule_refs": ["GOV-RULE-001"]},
                {"code": "KAM-2", "title": "政府采购程序合规性",
                 "description": "限额以上支出复核公开招标记录、中标通知书、合同备案。",
                 "rule_refs": ["GOV-RULE-002"]},
                {"code": "KAM-3", "title": "项目绩效目标完成度",
                 "description": "比对立项绩效目标与项目结题报告，量化偏离度。",
                 "rule_refs": ["GOV-RULE-003"]},
                {"code": "KAM-4", "title": "节余资金处理",
                 "description": "节余资金是否按办法上缴或结转，禁止转入经营性账户。",
                 "rule_refs": ["GOV-RULE-004"]},
            ],
            "risks": [
                {"risk": "服务外包供应商存在实控人关联方嫌疑（参考蓝海科技 SPC-2024-014 经验）",
                 "response": "工商穿透 + 银行流水核查 + 函证",
                 "severity": "high"},
                {"risk": "限额以上单笔采购可能拆分为多个分包以规避公开招标",
                 "response": "按供应商汇总后再判定限额，跨月份合并",
                 "severity": "high"},
                {"risk": "工程进度款发票真实性",
                 "response": "电子发票查验 + 监理日志比对",
                 "severity": "medium"},
                {"risk": "结余资金转入经营性账户",
                 "response": "专项账户期末余额穿行测试",
                 "severity": "medium"},
            ],
            "procedures": [
                {"step_no": "1.1", "description": "调取立项批复、资金拨付文件、专项账户开户证明",
                 "scope": "全期", "sampling": "全选", "expected_evidence": "批复扫描件 + 拨付凭证", "hours": 4},
                {"step_no": "1.2", "description": "专项账户进出明细按月份汇总，比对立项用途",
                 "scope": "12 个月", "sampling": "全选", "expected_evidence": "月度对账单 + 用途清单", "hours": 8},
                {"step_no": "2.1", "description": "限额以上采购抽样复核招标程序",
                 "scope": "单笔 ≥ 200,000 元", "sampling": "全选", "expected_evidence": "招标公告、评标记录、中标通知书", "hours": 12},
                {"step_no": "2.2", "description": "限额以下采购按 PPS 抽样 40 笔验真",
                 "scope": "单笔 < 200,000 元", "sampling": "PPS 40 笔", "expected_evidence": "合同、发票、付款凭证", "hours": 10},
                {"step_no": "3.1", "description": "供应商工商信息穿透 + 关联方比对",
                 "scope": "金额前 20 供应商", "sampling": "全选", "expected_evidence": "工商档案、股权穿透图", "hours": 6},
                {"step_no": "3.2", "description": "实控人体外循环风险扫描 (银行流水)",
                 "scope": "异常供应商", "sampling": "重点抽查", "expected_evidence": "银行流水对账", "hours": 8},
                {"step_no": "4.1", "description": "立项绩效目标 vs 项目结题报告比对",
                 "scope": "全部子项目", "sampling": "全选", "expected_evidence": "结题报告、绩效自评表", "hours": 6},
                {"step_no": "5.1", "description": "节余资金账户余额、上缴 / 结转凭证核查",
                 "scope": "期末", "sampling": "全选", "expected_evidence": "上缴凭证或结转决议", "hours": 4},
            ],
            "milestones": [
                {"phase": "进点 + 资料调取", "date": "2025-06-10", "deliverable": "进场备忘录"},
                {"phase": "现场审计", "date": "2025-06-30", "deliverable": "现场底稿初稿"},
                {"phase": "三级复核", "date": "2025-07-10", "deliverable": "复核意见"},
                {"phase": "终稿出具", "date": "2025-07-20", "deliverable": "专项审计报告 + 整改建议书"},
            ],
        }
        return LLMResult(content="", tool_calls=[{
            "id": "call_draft", "name": "draft_audit_plan",
            "arguments": {"fields": {"plan_sections": plan_sections, "status": "起草中"}},
        }])

    summary = (
        "已为「智慧城市新基建专项资金审计 (SPC-2025-031)」起草完整方案：\n"
        "• 总体目标：覆盖 8,500 万元专项资金 2024 全年拨付 / 使用 / 绩效；\n"
        "• 重要性水平：¥500,000（按 0.6% 设定，依财政部专项审计指引）；\n"
        "• 4 项 KAM 分别对应 GOV-RULE-001~004：专款专用 / 政府采购合规 / 绩效完成度 / 结余处理；\n"
        "• 风险点 4 条（其中 2 条 high — 关联方嫌疑、拆单规避招标），均给出应对措施；\n"
        "• 8 步审计程序，估计工时 58 h，涵盖现场、穿透、绩效、结余各环节；\n"
        "• 关键里程碑 4 个，终稿出具 2025-07-20。\n"
        "请在中间面板逐节复核，需要调整任何章节请告诉我。"
    )
    return LLMResult(content=summary, tool_calls=[])


def _has_called(messages: list[dict[str, Any]], name: str) -> bool:
    for m in messages:
        if m.get("role") != "assistant":
            continue
        for tc in m.get("tool_calls") or []:
            fn = tc.get("function") or {}
            if fn.get("name") == name:
                return True
    return False
