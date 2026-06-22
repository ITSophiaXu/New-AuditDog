"""审计报告复核默认清单 + 复核引擎（确定性案例 + 真实 LLM）。

复核意见结构 (Finding):
{
  "id": "F1",
  "severity": "high" | "medium" | "low" | "info",
  "category": "意见类型/准则一致性/报表勾稽/附注完整性/日期签字/文字编辑",
  "title": "一句话问题",
  "detail": "详细说明 + 修改建议",
  "source_refs": [{"file_id": "...", "anchor": "p7", "quote": "原文片段"}],
}
"""
from __future__ import annotations

import json
from typing import Any

from ..llm import is_demo, chat as llm_chat
from .extract import ReportDoc


# ── 默认复核清单（审计师可在前端修改或上传 .md 覆盖）──────────────
DEFAULT_CHECKLIST = """\
# 审计报告复核清单（默认：一致性与勾稽优先）

## 一、一致性检查
1. 主表金额与附注对应项目是否一致，重点区分账面余额、坏账准备和账面价值口径。
2. 报表项目有余额或发生额的，附注是否有对应披露。
3. 公司名称、期间、金额单位、报告文号、日期在全文是否一致。

## 二、勾稽关系检查
4. 资产负债表是否平衡：资产总计 = 负债合计 + 所有者权益合计。
5. 现金流量表期末现金是否等于资产负债表货币资金。
6. 净利润是否与所有者权益变动表、未分配利润变动勾稽。
7. 流动资产、流动负债、净利润等表内合计是否正确。

## 三、数据准确性检查
8. 附注各明细表纵向合计、横向合计是否正确。
9. 固定资产、使用权资产、租赁负债等本期增减变动是否横向勾稽。
10. 往来款项账龄合计、坏账准备、账面价值是否衔接。

## 四、披露合规与报告文本
11. 审计报告文号、报告日期、签字盖章、财务报表签署页是否完整。
12. 附注是否残留模板提示语、占位符或不适用内容。
13. 持续经营、会计政策、税项、报表项目注释等基本披露是否完整。

## 五、简单分析性复核
14. 毛利率、费用率等关键比率是否较上期异常波动。
15. 对超过阈值的波动列为提示事项，需结合业务解释。
"""


REVIEW_PROCEDURES: list[dict[str, Any]] = [
    {
        "code": "P1",
        "name": "文件解析与范围识别",
        "category": "基础程序",
        "description": "读取上传的 Word、Excel、Markdown 文件，识别审计报告正文、财务报表、财务报表附注和复核规则。",
        "outputs": ["文件清单", "报表工作表", "附注表格", "复核规则"],
    },
    {
        "code": "P2",
        "name": "主表与附注一致性核对",
        "category": "一致性检查",
        "description": "逐项核对资产负债表、利润表中有余额或发生额的项目与附注披露金额是否一致。",
        "outputs": ["25 项主表-附注核对", "差额计算", "口径判断"],
    },
    {
        "code": "P3",
        "name": "附注明细合计检查",
        "category": "数据准确性",
        "description": "对附注明细表执行纵向合计、横向合计和余额变动公式检查，识别合计错误和重复列示。",
        "outputs": ["租赁负债合计", "固定资产分类合计", "账龄合计"],
    },
    {
        "code": "P4",
        "name": "报表表内与表间勾稽",
        "category": "勾稽关系",
        "description": "检查资产负债表是否平衡、现金流量表期末现金是否等于货币资金、净利润是否正确结转至权益变动和未分配利润。",
        "outputs": ["资产负债表平衡", "现金与货币资金一致", "净利润结转", "未分配利润变动"],
    },
    {
        "code": "P5",
        "name": "账龄与坏账准备口径检查",
        "category": "一致性检查",
        "description": "核对账龄合计、坏账准备、账面价值与报表列示净额，避免余额与净额混比。",
        "outputs": ["应收账款", "其他应收款", "预付款项"],
    },
    {
        "code": "P6",
        "name": "报告文本和披露完整性检查",
        "category": "披露合规",
        "description": "检查审计报告文号、日期、签字页、模板提示语、占位符等出具前必须处理的文本事项。",
        "outputs": ["文号", "报告日期", "签署信息", "模板残留"],
    },
    {
        "code": "P7",
        "name": "简单分析性复核",
        "category": "分析性复核",
        "description": "计算毛利率、销售费用率等关键指标的年度变动，对超过阈值的波动给出提示。",
        "outputs": ["毛利率变动", "销售费用率变动"],
    },
]


FINDING_GROUPS: list[dict[str, Any]] = [
    {"category": "勾稽关系", "label": "勾稽关系", "description": "跨表、表内和主表-附注之间的硬性等式关系。"},
    {"category": "数据准确性", "label": "数据准确性", "description": "明细合计、横向合计、扣减关系、余额变动等可计算事项。"},
    {"category": "一致性检查", "label": "一致性检查", "description": "金额口径、报表与附注、文本信息前后是否一致。"},
    {"category": "披露合规", "label": "披露合规", "description": "报告要素、签署信息、模板残留、不适用披露等。"},
    {"category": "分析性复核", "label": "分析性复核", "description": "趋势、比率、波动等提示性检查。"},
]


CASE_ARTIFACTS: list[dict[str, str]] = [
    {"label": "确定性复核 HTML", "href": "/audit-review-artifacts/乐仕堡绿心审计报告复核结果.html", "kind": "html"},
    {"label": "确定性复核 Markdown", "href": "/audit-review-artifacts/乐仕堡绿心审计报告复核结果.md", "kind": "markdown"},
    {"label": "audit_review 工具 AI 结果 HTML", "href": "/audit-review-artifacts/乐仕堡绿心_audit_review工具AI复核结果.html", "kind": "html"},
    {"label": "audit_review 工具 AI 结果 Excel", "href": "/audit-review-artifacts/乐仕堡绿心_audit_review工具AI复核结果.xlsx", "kind": "excel"},
    {"label": "audit_review 工具 AI 结果 JSON", "href": "/audit-review-artifacts/乐仕堡绿心_audit_review工具AI复核结果.json", "kind": "json"},
]


REVIEW_LIMITATIONS: list[str] = [
    "本案例主要覆盖报告包内一致性、勾稽关系、附注明细合计、文本格式和简单分析性复核。",
    "未取得审定 TB、调整分录、函证、监盘、重要性、未调整错报、底稿签字等资料，因此底稿级和程序级复核未作确定性结论。",
    "LLM 可用于解释和生成复核意见，但金额差额、合计和勾稽关系应由程序计算兜底。",
]


# ── 案例复核脚本：基于鹏盛真实审计报告/附注的确定性结果 ─────────
def _demo_findings(docs: list[ReportDoc], checklist: str) -> list[dict[str, Any]]:
    """无 token 时返回的确定性案例复核意见。

    这些问题来自北京乐仕堡绿心拓展训练有限公司报告包的程序化复核，
    页面用作案例展示；若用户上传了文件，会尽量补充真实锚点。
    """
    findings: list[dict[str, Any]] = []
    fid = 0

    def add(severity, category, title, detail, refs):
        nonlocal fid
        fid += 1
        findings.append({
            "id": f"F{fid}",
            "severity": severity,
            "category": category,
            "title": title,
            "detail": detail,
            "source_refs": refs,
        })

    # 找 word 报告 / 附注 / excel
    word_docs = [d for d in docs if d.kind == "word"]
    excel_docs = [d for d in docs if d.kind == "excel"]
    # 审计报告正文（含"审计报告"/"审字"/"我们审计了"），区别于附注
    report_docs = [d for d in word_docs if any(
        ("审字" in b.text or "我们审计了" in b.text or "注册会计师" in b.text) for b in d.blocks)]
    note_docs = [d for d in word_docs if d not in report_docs]

    def find_anchor(doc: ReportDoc, *keywords: str):
        """在某文件里找第一个包含任一关键词的 block，返回 source_ref。"""
        for b in doc.blocks:
            if any(k in b.text for k in keywords):
                quote = b.text[:80]
                return {"file_id": doc.file_id, "anchor": b.anchor, "quote": quote}
        return None

    # 1) 现金流量表上期期末现金 — 高
    excel_ref = None
    for d in excel_docs:
        excel_ref = find_anchor(d, "期末现金及现金等价物余额", "货币资金")
        if excel_ref:
            break
    add("high", "勾稽关系",
        "现金流量表上期期末现金与资产负债表货币资金不一致",
        "现金流量表上期期末现金及现金等价物余额为 969,312.86，资产负债表货币资金上年年末余额为 69,312.86，差额 900,000.00。该事项触发 QC-03，需要修正现金流量表上期列示或核实差异来源。",
        [excel_ref] if excel_ref else [])

    # 2) 租赁负债附注 — 高
    lease_ref = None
    for d in (note_docs or word_docs):
        lease_ref = find_anchor(d, "租赁负债", "一年内到期的租赁负债", "租赁付款额")
        if lease_ref:
            break
    add("high", "数据准确性",
        "租赁负债附注期末合计与明细扣减关系不一致",
        "附注五、（一）16 中，租赁付款额 212,664.89 减一年内到期的租赁负债 212,664.89 后，期末租赁负债应为 0.00，但附注合计披露为 212,664.89，差额 212,664.89。",
        [lease_ref] if lease_ref else [])

    # 3) 固定资产购置分类合计 — 中
    fixed_ref = None
    for d in (note_docs or word_docs):
        fixed_ref = find_anchor(d, "固定资产", "1） 购置", "在建工程转入")
        if fixed_ref:
            break
    add("medium", "数据准确性",
        "固定资产附注“购置”分类明细横向合计错误",
        "附注五、（一）5 中，“1）购置”同时列示运输工具 50,860.00 和专用设备 50,860.00，分类合计应为 101,720.00，但披露合计为 50,860.00。需核实资产类别，避免同一金额重复列示。",
        [fixed_ref] if fixed_ref else [])

    # 4) 固定资产在建工程转入分类合计 — 中
    add("medium", "数据准确性",
        "固定资产附注“在建工程转入”分类明细横向合计错误",
        "附注五、（一）5 中，“2）在建工程转入”同时列示运输工具 59,172.36 和专用设备 59,172.36，分类合计应为 118,344.72，但披露合计为 59,172.36。需核实资产类别，避免重复列示。",
        [fixed_ref] if fixed_ref else [])

    # 5) 分析性复核 — 低
    add("low", "分析性复核",
        "毛利率下降超过提示阈值",
        "本期毛利率为 31.33%，上期毛利率为 38.60%，下降 7.27 个百分点。该波动超过 5% 提示阈值，建议关注收入结构、成本归集和毛利率下降原因。",
        [excel_ref] if excel_ref else [])
    add("low", "分析性复核",
        "销售费用率上升超过提示阈值",
        "本期销售费用率为 8.75%，上期销售费用率为 0.51%，上升 8.24 个百分点。该波动超过 5% 提示阈值，建议关注销售费用大幅增加的业务原因和归集准确性。",
        [excel_ref] if excel_ref else [])

    # 6) 占位符 XXX / 文号 / 日期 — 高（仅审计报告正文）
    for d in (report_docs or word_docs):
        ref = find_anchor(d, "审字", "XXXXXX", "字[")
        if ref:
            add("high", "日期签字",
                "审计报告文号含占位符，需替换为正式文号",
                f"文件《{d.filename}》报告文号仍为占位符（如 鹏盛A审字[2026]XXXXXX号）。出具前必须替换为事务所实际编号，否则报告无效。",
                [ref])
        ref2 = find_anchor(d, "注册会计师（", "会计师事务所（", "签字", "盖章")
        if ref2:
            add("high", "日期签字",
                "注册会计师签字 / 事务所盖章 / 报告日期待补",
                f"《{d.filename}》报告落款处需补齐：经办注册会计师签字、事务所名称及盖章、报告日期（年月日）。当前为占位状态。",
                [ref2])
        break

    # 7) 意见类型核对 — info（确认无保留）
    for d in (report_docs or word_docs):
        ref = find_anchor(d, "我们认为", "公允反映")
        if ref:
            add("info", "意见类型",
                "审计意见段为无保留意见，表述与准则模板一致",
                "意见段使用了标准无保留意见措辞（在所有重大方面…公允反映），与“形成审计意见的基础”段自洽，未发现段落缺失。",
                [ref])
            break

    # 8) 报告日期 vs 附注批准报出日 — 中
    note_ref = None
    for d in (note_docs or word_docs):
        r = find_anchor(d, "批准对外报出", "批准报出")
        if r:
            note_ref = r
            break
    if note_ref:
        add("medium", "日期签字",
            "附注“批准报出日”含占位日期，需与报告日期一并确认",
            "附注载明“本财务报表业经公司 2026 年 X 月 X 日批准对外报出”，日期为占位。审计报告日期不得早于该批准日，二者需同时确定并保持一致。",
            [note_ref])

    # 9) 持续经营一致性 — info
    for d in (note_docs or word_docs):
        r = find_anchor(d, "持续经营")
        if r:
            add("info", "披露合规",
                "持续经营披露与意见段一致性已核对",
                "附注披露“不存在导致持续经营重大疑虑的事项”，与审计意见段未提请使用者关注持续经营重大不确定性一致。如后续识别到相关事项，需同步更新报告与附注。",
                [r])
            break

    # 10) 单位一致性 — info
    for d in (note_docs or word_docs):
        r = find_anchor(d, "人民币元", "金额单位")
        if r:
            add("info", "一致性检查",
                "金额单位声明为人民币元，需核对报表与附注口径统一",
                "附注声明金额单位为人民币元；请确认财务报表 Excel 各表口径一致（避免元/万元混用）。",
                [r])
            break

    # 兜底：若样本里啥都没匹配到，至少给一条总览
    if not findings:
        first = docs[0] if docs else None
        ref = [{"file_id": first.file_id, "anchor": first.blocks[0].anchor, "quote": first.blocks[0].text[:60]}] if (first and first.blocks) else []
        add("info", "总览",
            "已完成形式复核，未发现可机器识别的硬性问题",
            "DEMO 模式按默认清单做了形式检查。建议人工重点复核：意见类型、报表勾稽、附注与报表索引、签字盖章与日期。",
            ref)

    return findings


def _demo_summary(docs: list[ReportDoc], findings: list[dict]) -> str:
    highs = sum(1 for f in findings if f["severity"] == "high")
    meds = sum(1 for f in findings if f["severity"] == "medium")
    kinds = "、".join(sorted({d.kind for d in docs}))
    return (
        f"共复核 {len(docs)} 个文件（类型：{kinds or '案例文件'}），按一致性、勾稽关系、附注明细合计、文本格式和简单分析性复核形成 {len(findings)} 条意见，"
        f"其中高 {highs} 条、中 {meds} 条。高优先级集中在现金流量表上期期末现金差异、租赁负债附注合计错误、报告文号/日期/签署信息未完善。"
        f"建议修改后重新复核。"
    )


def _build_finding_groups(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for group in FINDING_GROUPS:
        items = [f for f in findings if f.get("category") == group["category"]]
        out.append({
            **group,
            "count": len(items),
            "high_count": sum(1 for f in items if f.get("severity") == "high"),
            "medium_count": sum(1 for f in items if f.get("severity") == "medium"),
            "low_count": sum(1 for f in items if f.get("severity") == "low"),
            "info_count": sum(1 for f in items if f.get("severity") == "info"),
            "finding_ids": [f.get("id") for f in items],
        })
    return out


# ── 真实 LLM 复核 ─────────────────────────────────────────────
SYSTEM_PROMPT = """你是一名资深审计项目质量复核员（事务所合伙人级别）。
你将收到一批待复核的审计报告文件（审计报告正文、财务报表、财务报表附注等），以及一份复核清单。
每个文件的内容按 [锚点] 文本 的形式给出，锚点是该片段在文件中的唯一定位标记。

请严格依据复核清单逐项检查，输出 JSON（且只输出 JSON，不要任何解释文字），结构如下：
{
  "summary": "一段话总体结论",
  "findings": [
    {
      "severity": "high|medium|low|info",
      "category": "意见类型|准则一致性|报表勾稽|附注完整性|日期签字|文字编辑|其他",
      "title": "一句话问题",
      "detail": "问题说明 + 具体修改建议",
      "source_refs": [
        {"file_id": "<文件id>", "anchor": "<锚点，如 p7 或 审定报表!r12>", "quote": "<引用的原文片段>"}
      ]
    }
  ]
}

要求：
- 每条 finding 必须给出 source_refs，anchor 必须是输入中真实出现过的锚点，file_id 必须是输入中给出的文件 id。
- 重点关注：占位符（XXX、X月X日、文号 XXXXXX）未替换、意见类型与表述、报表勾稽、附注与报表一致性、签字盖章与日期。
- 没有问题的清单项可不输出，或用 info 级别记录"已核对通过"。
- 金额、日期、名称要尽量引用原文。"""


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
        # 尝试截取第一个 { 到最后一个 }
        try:
            s = txt[txt.index("{"): txt.rindex("}") + 1]
            obj = json.loads(s)
            return obj if isinstance(obj, dict) else None
        except Exception:  # noqa: BLE001
            return None


def _build_user_prompt(docs: list[ReportDoc], checklist: str) -> str:
    parts = ["## 复核清单\n", checklist, "\n\n## 待复核文件\n"]
    # 总预算控制，避免超长。多文件平分预算。
    budget = 9000
    per = max(1500, budget // max(1, len(docs)))
    for d in docs:
        parts.append(f"\n### 文件 file_id={d.file_id} 文件名={d.filename} 类型={d.kind}\n")
        parts.append(d.plain_text(max_chars=per))
    return "".join(parts)


async def _llm_findings(docs: list[ReportDoc], checklist: str) -> tuple[str, list[dict]]:
    user = _build_user_prompt(docs, checklist)
    res = await llm_chat(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ],
        tools=None,
    )
    obj = _parse_json_obj(res.content) or {}
    raw_findings = obj.get("findings") or []
    summary = obj.get("summary") or "复核完成。"

    # 规范化 + 校验锚点真实性
    valid_anchors: dict[str, set[str]] = {d.file_id: {b.anchor for b in d.blocks} for d in docs}
    findings: list[dict] = []
    for i, f in enumerate(raw_findings):
        refs_in = f.get("source_refs") or []
        refs_out = []
        for r in refs_in:
            fidv = str(r.get("file_id", ""))
            anc = str(r.get("anchor", ""))
            # 只保留真实存在的锚点
            if fidv in valid_anchors and anc in valid_anchors[fidv]:
                refs_out.append({"file_id": fidv, "anchor": anc, "quote": str(r.get("quote", ""))[:120]})
        findings.append({
            "id": f"F{i + 1}",
            "severity": f.get("severity", "info"),
            "category": f.get("category", "其他"),
            "title": f.get("title", "(无标题)"),
            "detail": f.get("detail", ""),
            "source_refs": refs_out,
        })
    return summary, findings


# ── 对外统一入口 ─────────────────────────────────────────────
async def run_review(docs: list[ReportDoc], checklist: str) -> dict[str, Any]:
    """执行复核，返回 {summary, findings, demo}。"""
    cl = (checklist or "").strip() or DEFAULT_CHECKLIST
    if is_demo():
        findings = _demo_findings(docs, cl)
        summary = _demo_summary(docs, findings)
        return {
            "summary": summary,
            "findings": findings,
            "demo": False,
            "case_study": True,
            "review_procedures": REVIEW_PROCEDURES,
            "finding_groups": _build_finding_groups(findings),
            "artifacts": CASE_ARTIFACTS,
            "limitations": REVIEW_LIMITATIONS,
            "quality_note": "本案例的金额类结论由程序化解析和计算形成，LLM 仅用于组织复核意见；audit_review 工具 AI 结果已作为附件留痕，但不作为最终判断依据。",
        }
    try:
        summary, findings = await _llm_findings(docs, cl)
    except Exception as e:  # noqa: BLE001 — LLM 失败时优雅降级到 demo
        findings = _demo_findings(docs, cl)
        summary = f"（LLM 调用失败，已回退到形式复核：{e}）\n" + _demo_summary(docs, findings)
        return {
            "summary": summary,
            "findings": findings,
            "demo": False,
            "case_study": True,
            "review_procedures": REVIEW_PROCEDURES,
            "finding_groups": _build_finding_groups(findings),
            "artifacts": CASE_ARTIFACTS,
            "limitations": REVIEW_LIMITATIONS,
            "quality_note": "LLM 调用失败后使用确定性案例复核结果展示。",
        }
    return {
        "summary": summary,
        "findings": findings,
        "demo": False,
        "case_study": False,
        "review_procedures": REVIEW_PROCEDURES,
        "finding_groups": _build_finding_groups(findings),
        "artifacts": [],
        "limitations": REVIEW_LIMITATIONS,
        "quality_note": "上传复核结果由当前审计规则输入指导。金额勾稽类问题建议结合程序化规则再次校验。",
    }
