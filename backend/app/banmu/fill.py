"""斑目项目底稿 AI 填稿逻辑（含人工确认暂停点）。

设计：
  fill_<index>(accounting_standard)  → FillResult(sheet_data_partial, decisions[])
  resume_<index>()                   → sheet_data_final  (after all decisions resolved)

暂停点支持：Y3（基准选择）、Y5（规模 + 策略）、X1（关联方确认）

会计准则来源：由路由层从 Engagement 对象读取后传入，不在此处自动推断。
"""
from __future__ import annotations
import copy
from dataclasses import dataclass, field
from typing import Optional

from .data import COMPANY_INFO, CLIENT_MATERIALS, AR_DETAIL, TB, get_totals

_STD_PLACEHOLDER = "（待填：会计准则 — 请在项目信息中填写，依据向管理层询问结果）"


@dataclass
class FillDecision:
    key: str          # unique within paper, e.g. "Y3-basis-choice"
    paper_index: str  # "Y3"
    cell_path: str    # dotted path in sheet_data
    question: str     # shown to auditor
    context: str      # AI reasoning (markdown)
    options: list[dict] = field(default_factory=list)  # [{label,value,amount?,note?}]


@dataclass
class FillResult:
    paper_index: str
    sheet_data: dict        # partial fill; judgment cells = "【待人工选择】"
    decisions: list[FillDecision]
    fill_summary: str


# ─── Y3 重要性水平 ────────────────────────────────────────────────────

def fill_Y3() -> FillResult:
    t = get_totals()
    rev   = t["revenue"]
    ta    = t["total_assets"]
    na    = t["net_assets"]
    pbt   = t["profit_before_tax"]

    sheet_data = {
        "basis_analysis": {
            "rows": [
                {"indicator": "营业收入", "amount": rev,  "suggested_rate": "0.5%–1%",
                 "calculated_pm": round(rev * 0.005), "is_recommended": True},
                {"indicator": "总资产",   "amount": ta,   "suggested_rate": "1%–2%",
                 "calculated_pm": round(ta * 0.01),  "is_recommended": False},
                {"indicator": "净资产",   "amount": na,   "suggested_rate": "3%–5%",
                 "calculated_pm": round(na * 0.05),  "is_recommended": False},
                {"indicator": "利润总额", "amount": pbt,  "suggested_rate": "5%–10%",
                 "calculated_pm": round(pbt * 0.05), "is_recommended": False},
            ],
            "ai_note": (
                f"AI已根据TB数据计算四种基准指标。"
                f"本公司为{COMPANY_INFO['industry']}行业，营业收入稳定（¥{rev:,.0f}），AI推荐以营业收入为基准。"
            ),
        },
        "conclusion": {
            "basis_indicator": "【待人工选择】",
            "basis_amount":    None,
            "pm_rate":         "【待人工选择后自动计算】",
            "pm_amount":       None,
            "te_rate":         "75%",
            "te_amount":       None,
            "clearly_trivial": None,
        },
    }

    decision = FillDecision(
        key="Y3-basis-choice",
        paper_index="Y3",
        cell_path="conclusion.basis_indicator",
        question="请选择重要性水平基准指标",
        context=(
            f"AI已根据TB数据计算四种方案：\n"
            f"• **营业收入** ¥{rev:,.0f} × 0.5% = **¥{round(rev*0.005):,}**（推荐）\n"
            f"• 总资产 ¥{ta:,.0f} × 1% = ¥{round(ta*0.01):,}\n"
            f"• 净资产 ¥{na:,.0f} × 5% = ¥{round(na*0.05):,}\n"
            f"• 利润总额 ¥{pbt:,.0f} × 5% = ¥{round(pbt*0.05):,}\n\n"
            f"本公司为**{COMPANY_INFO['industry']}**行业，营业收入稳定增长，AI推荐以营业收入为基准。"
        ),
        options=[
            {"label": "营业收入（推荐）", "value": "营业收入",
             "amount": f"¥{round(rev*0.005):,}", "rate": "0.5%"},
            {"label": "总资产",          "value": "总资产",
             "amount": f"¥{round(ta*0.01):,}",  "rate": "1%"},
            {"label": "净资产",          "value": "净资产",
             "amount": f"¥{round(na*0.05):,}",  "rate": "5%"},
            {"label": "利润总额",        "value": "利润总额",
             "amount": f"¥{round(pbt*0.05):,}", "rate": "5%"},
        ],
    )

    return FillResult(
        paper_index="Y3",
        sheet_data=sheet_data,
        decisions=[decision],
        fill_summary=(
            f"AI已填写重要性水平基准分析（4种方案），"
            f"需人工选择基准指标后自动计算 PM/TE/明显微小金额。"
        ),
    )


def resume_Y3(sheet_data: dict, decisions: dict) -> dict:
    """decisions: {key: resolved_value}"""
    sd = copy.deepcopy(sheet_data)
    t = get_totals()
    basis = decisions.get("Y3-basis-choice", "营业收入")

    basis_map = {
        "营业收入": (t["revenue"],           0.005),
        "总资产":   (t["total_assets"],       0.01),
        "净资产":   (t["net_assets"],         0.05),
        "利润总额": (t["profit_before_tax"],  0.05),
    }
    amount, rate = basis_map.get(basis, (t["revenue"], 0.005))
    pm      = round(amount * rate)
    te      = round(pm * 0.75)
    trivial = round(pm * 0.05)

    sd["conclusion"].update({
        "basis_indicator": basis,
        "basis_amount":    amount,
        "pm_rate":         f"{rate*100:.1f}%",
        "pm_amount":       pm,
        "te_rate":         "75%",
        "te_amount":       te,
        "clearly_trivial": trivial,
        "conclusion_text": (
            f"本次审计以{basis}（¥{amount:,.2f}）为重要性水平基准，"
            f"整体重要性水平（PM）= ¥{pm:,}（{rate*100:.1f}%），"
            f"执行重要性水平（TE）= ¥{te:,}（PM×75%），"
            f"明显微小错报临界值 = ¥{trivial:,}（PM×5%）。"
        ),
    })
    return sd


# ─── Y5 企业规模与审计策略 ────────────────────────────────────────────

_STD_DECISION = FillDecision(
    key="accounting-standard",
    paper_index="",          # filled in per-paper below
    cell_path="applicable_standard.standard",
    question="请填写本次审计适用的会计准则（向管理层询问后确认）",
    context=(
        "适用会计准则直接影响底稿填写内容（披露要求、报表格式、会计政策等）。\n"
        "该信息应由审计师向被审单位管理层询问后确认，不由 AI 自动判断。"
    ),
    options=[
        {"label": "企业会计准则",           "value": "企业会计准则（财政部2006年及后续修订）"},
        {"label": "小企业会计准则",          "value": "小企业会计准则（财会〔2013〕17号）"},
        {"label": "企业会计制度",            "value": "企业会计制度（财会〔2000〕25号）"},
        {"label": "事业单位会计准则",         "value": "事业单位会计准则（财会〔2012〕22号）"},
        {"label": "民间非营利组织会计制度",   "value": "民间非营利组织会计制度（财会〔2004〕7号）"},
        {"label": "村集体经济组织会计制度",   "value": "村集体经济组织会计制度（财农〔2004〕144号）"},
        {"label": "农民专业合作社财务会计制度（试行）", "value": "农民专业合作社财务会计制度（试行）（财会〔2007〕15号）"},
        {"label": "政府会计准则",            "value": "政府会计准则（财政部2015年及后续修订）"},
        {"label": "其他",                   "value": "其他"},
    ],
)


def fill_Y5(accounting_standard: str | None = None) -> FillResult:
    t = get_totals()
    std = accounting_standard or _STD_PLACEHOLDER
    sheet_data = {
        "applicable_standard": {
            "standard": std,
            "source":   "向管理层询问后由审计师在项目信息中填写",
            "ai_auto":  False,
        },
        "scale_judgement": {
            "criteria": [
                {"criterion": "从业人员",
                 "threshold_small": "100人", "actual": f"约{COMPANY_INFO['employees']}人",
                 "meets_small": COMPANY_INFO["employees"] <= 100},
                {"criterion": "营业收入",
                 "threshold_small": "¥5,000万", "actual": f"¥{t['revenue']:,.0f}",
                 "meets_small": t["revenue"] <= 50_000_000},
                {"criterion": "资产总额",
                 "threshold_small": "¥5,000万", "actual": f"¥{t['total_assets']:,.0f}",
                 "meets_small": t["total_assets"] <= 50_000_000},
            ],
            "ai_suggestion": "中型企业",
            "company_type":  "【待人工确认】",
            "ai_note": (
                "营业收入超过¥5,000万标准，其余两项（从业人员、资产总额）符合小型标准。"
                "AI建议按**中型企业**处理。"
            ),
        },
        "strategy": {
            "audit_approach":  "【待人工选择】",
            "planned_response": "【待人工选择后填写】",
        },
    }

    decisions: list[FillDecision] = []
    if not accounting_standard:
        std_dec = copy.copy(_STD_DECISION)
        std_dec.paper_index = "Y5"
        decisions.append(std_dec)

    decisions += [
        FillDecision(
            key="Y5-scale-type",
            paper_index="Y5",
            cell_path="scale_judgement.company_type",
            question="请确认企业规模类型",
            context=(
                f"TB数据分析：\n"
                f"• 营业收入：¥{t['revenue']:,.0f}（**超过**¥5,000万标准）\n"
                f"• 总资产：¥{t['total_assets']:,.0f}（未超过）\n"
                f"• 从业人员：约{COMPANY_INFO['employees']}人（未超过100人）\n\n"
                "多数指标符合小型标准，但营业收入超标。AI建议按**中型企业**处理，"
                "如合伙人认为整体规模仍属小型可选择小型。"
            ),
            options=[
                {"label": "中型企业（推荐）", "value": "中型",
                 "note": "营业收入超标准，整体归中型"},
                {"label": "小型企业", "value": "小型",
                 "note": "若合伙人判断整体属小型可选此项"},
            ],
        ),
        FillDecision(
            key="Y5-audit-approach",
            paper_index="Y5",
            cell_path="strategy.audit_approach",
            question="请选择整体审计策略",
            context=(
                "根据企业规模和内控情况，建议选择审计策略：\n\n"
                "• **以实质性程序为主**：适合内控尚未全面评估、或IT服务业内控通常较弱的情形。\n"
                "• **控制测试+实质性程序（双向策略）**：适合内控环境较好、可依赖控制以减少实质性测试。\n\n"
                f"本公司为{COMPANY_INFO['industry']}行业，规模中等，AI推荐以**实质性程序为主**。"
            ),
            options=[
                {"label": "以实质性程序为主（推荐）", "value": "实质性程序为主",
                 "note": "减少对内控的依赖，扩大实质性测试范围"},
                {"label": "控制测试 + 实质性程序（双向）", "value": "双向策略",
                 "note": "如内控评估结果良好可选此项"},
            ],
        ),
    ]

    return FillResult(
        paper_index="Y5",
        sheet_data=sheet_data,
        decisions=decisions,
        fill_summary="AI已填写企业规模判断分析，需人工确认企业规模类型和整体审计策略。",
    )


def resume_Y5(sheet_data: dict, decisions: dict) -> dict:
    sd = copy.deepcopy(sheet_data)
    scale    = decisions.get("Y5-scale-type",     "中型")
    approach = decisions.get("Y5-audit-approach", "实质性程序为主")

    planned = {
        "实质性程序为主": (
            "以实质性测试为主。对应收账款（余额¥12,345,678，占总资产59%）、营业收入执行详细分析程序和明细测试；"
            "对货币资金执行函证程序；对固定资产和无形资产执行盘点/复核。"
        ),
        "双向策略": (
            "执行控制测试（收入认可、应收账款授权）评估内控有效性，结合分析程序和明细实质性测试。"
        ),
    }.get(approach, "以实质性测试为主。")

    sd["scale_judgement"]["company_type"] = scale
    sd["strategy"].update({
        "audit_approach":   approach,
        "planned_response": planned,
        "key_risk_areas":   ["应收账款回收风险", "收入确认时点（软件交付节点）", "关联方交易公允性"],
        "conclusion_text":  (
            f"确认被审单位属于**{scale}企业**，本次审计采用**{approach}**的整体审计策略。"
        ),
    })
    return sd


# ─── X1 企业基本情况 ─────────────────────────────────────────────────

def fill_X1(accounting_standard: str | None = None) -> FillResult:
    t = get_totals()
    ci = COMPANY_INFO
    rp = CLIENT_MATERIALS["related_parties"]
    rp_preview = "；".join(f"{r['name']}（{r['relationship']}）" for r in rp)
    std = accounting_standard or _STD_PLACEHOLDER

    sheet_data = {
        "company_info": {
            "name":               ci["name"],
            "short_name":         ci["short_name"],
            "legal_rep":          ci["legal_rep"],
            "registered_capital": ci["registered_capital"],
            "established":        ci["established"],
            "address":            ci["address"],
            "business_scope":     ci["business_scope"],
            "industry":           ci["industry"],
            "employees":          ci["employees"],
            "auditor":            ci["auditor"],
            "accounting_std":     std,
        },
        "key_financials": {
            "year":              "2024",
            "revenue":           t["revenue"],
            "total_assets":      t["total_assets"],
            "net_assets":        t["net_assets"],
            "profit_before_tax": t["profit_before_tax"],
            "ar_balance":        t["ar_balance"],
            "ar_to_revenue_pct": f"{t['ar_balance']/t['revenue']*100:.1f}%",
        },
        "related_parties": {
            "identified":  "【待人工确认】",
            "ai_preview":  rp_preview,
            "list":        "【待人工确认后填写】",
        },
    }

    rp_lines = "\n".join(
        f"• **{r['name']}**（{r['relationship']}）：{r['transaction_type']}，期末余额 ¥{r['balance']:,.0f}。{r['note']}"
        for r in rp
    )

    decisions: list[FillDecision] = []
    if not accounting_standard:
        std_dec = copy.copy(_STD_DECISION)
        std_dec.paper_index = "X1"
        decisions.append(std_dec)

    decisions.append(FillDecision(
        key="X1-related-parties",
        paper_index="X1",
        cell_path="related_parties.identified",
        question="请确认以下关联方名单是否完整、准确",
        context=(
            f"AI根据工商信息及客户提供的股权结构图，识别出以下关联方：\n\n{rp_lines}\n\n"
            "如有遗漏请选择'有遗漏'并通过'询问 Agent'补充。"
        ),
        options=[
            {"label": "确认名单完整", "value": "是",
             "note": "以上关联方名单已完整准确"},
            {"label": "有遗漏 / 需修改", "value": "否",
             "note": "请通过右侧'询问 Agent'补充关联方信息"},
        ],
    ))

    return FillResult(
        paper_index="X1",
        sheet_data=sheet_data,
        decisions=decisions,
        fill_summary="AI已根据工商信息填写企业基本情况及财务数据，需人工确认关联方名单。",
    )


def resume_X1(sheet_data: dict, decisions: dict) -> dict:
    sd = copy.deepcopy(sheet_data)
    confirmed = decisions.get("X1-related-parties", "是")
    rp = CLIENT_MATERIALS["related_parties"]

    if confirmed == "是":
        sd["related_parties"] = {
            "identified": "是",
            "list": [
                {
                    "name":             r["name"],
                    "relationship":     r["relationship"],
                    "transaction_type": r["transaction_type"],
                    "balance":          r["balance"],
                    "note":             r["note"],
                }
                for r in rp
            ],
            "confirmation_note": "已确认关联方名单完整。需在执行阶段对关联方交易执行专项审计程序。",
        }
    else:
        sd["related_parties"]["identified"] = "否 — 待补充"
    return sd


# ─── A1 货币资金 ─────────────────────────────────────────────────────

def fill_A1() -> FillResult:
    cash   = next(r["balance"] for r in TB if r["code"] == "1001")   # 12,345
    bank   = next(r["balance"] for r in TB if r["code"] == "1002")   # 3,444,456
    other  = next(r["balance"] for r in TB if r["code"] == "1012")   # 500,000
    total  = cash + bank + other                                       # 3,956,801

    sheet_data = {
        "summary": {
            "cash_on_hand":        cash,
            "bank_deposits":       bank,
            "other_monetary":      other,
            "book_balance":        total,
            "audit_objective":     "确认货币资金期末余额的存在性、完整性及计价准确性",
        },
        "bank_accounts": {
            "rows": [
                {"account_bank": "中国工商银行无锡高新支行", "account_type": "基本账户", "currency": "人民币",
                 "book_balance": 2_234_456, "confirmation_status": "【待人工发函】"},
                {"account_bank": "招商银行无锡分行",         "account_type": "一般账户", "currency": "人民币",
                 "book_balance": 1_210_000, "confirmation_status": "【待人工发函】"},
                {"account_bank": "其他货币资金（支付宝/微信企业账户等）", "account_type": "其他货币资金",
                 "currency": "人民币", "book_balance": other,
                 "confirmation_status": "【待核查是否受限】"},
            ]
        },
        "analytical_procedures": {
            "total_book_balance":    total,
            "pct_of_total_assets":   f"{total / 20_993_845 * 100:.1f}%",
            "cash_balance":          cash,
            "restricted_fund_flag":  "其他货币资金¥500,000 — AI无法从账套判断是否受限，需人工核查",
            "ai_finding":            "账面货币资金合计¥3,956,801，银行存款为主（87%），符合软件服务企业特征",
        },
        "audit_procedures_plan": {
            "rows": [
                {"procedure": "银行函证",     "scope": "全部开户行",
                 "status": "待执行", "responsible": "人工", "note": "向工行、招行发函证确认期末余额"},
                {"procedure": "现金盘点",     "scope": f"库存现金¥{cash:,.0f}",
                 "status": "待执行", "responsible": "人工", "note": "现场盘点并填写盘点记录"},
                {"procedure": "受限资金核查", "scope": f"其他货币资金¥{other:,.0f}",
                 "status": "待判断", "responsible": "人工", "note": "确认是否存在质押、冻结或监管要求"},
                {"procedure": "截止性测试",   "scope": "12月末前后各5个工作日",
                 "status": "AI已识别风险点", "responsible": "人工执行", "note": "检查跨期收付款入账时点"},
            ]
        },
        "conclusion": {
            "book_balance":       total,
            "audit_adjustment":   "【待函证完成后确定】",
            "audited_balance":    "【待填】",
            "restricted_amount":  "【待核查】",
            "risk_assessment":    "低",
        },
    }

    decisions = [
        FillDecision(
            key="A1-restricted-funds",
            paper_index="A1",
            cell_path="conclusion.restricted_amount",
            question="请核查其他货币资金（¥500,000）是否存在受限情形",
            context=(
                "AI从TB账套识别到科目1012「其他货币资金」余额¥500,000。\n\n"
                "常见受限情形：\n"
                "• 开立银行承兑汇票保证金\n"
                "• 信用证保证金\n"
                "• 股权或资产质押\n"
                "• 冻结账户\n\n"
                "需要查阅：银行开户协议、理财确认书、12月末银行对账单备注。\n"
                "受限资金需在报表附注单独披露，不得合并入流动资产货币资金。"
            ),
            options=[
                {"label": "无受限，全部可自由支配",    "value": "无受限",   "note": "已核查，¥500,000均可自由支配"},
                {"label": "存在受限，金额待确认",       "value": "部分受限", "note": "已识别受限，具体金额需补充"},
                {"label": "全部受限（如保证金账户）",   "value": "全部受限", "note": "¥500,000均受限，需重分类"},
            ],
        ),
        FillDecision(
            key="A1-bank-confirmation",
            paper_index="A1",
            cell_path="bank_accounts",
            question="银行函证已发出并收回，请确认函证结果",
            context=(
                "AI已列出银行账户清单（工行¥2,234,456 + 招行¥1,210,000）。\n\n"
                "函证是货币资金最主要的证据来源，需人工：\n"
                "• 向开户行发出函证并追踪回函\n"
                "• 核对函证金额与账面是否一致\n"
                "• 不一致时执行差异调节\n\n"
                "若函证未回，需执行替代程序（审阅1月初银行回单、检查期后收付款）。"
            ),
            options=[
                {"label": "函证已全部收回，与账面一致",     "value": "函证一致",   "note": "无差异，结论：余额真实"},
                {"label": "函证收回，存在差异，已调节完毕", "value": "函证差异已调节", "note": "差异原因已记录，调节后一致"},
                {"label": "函证未全部收回，已执行替代程序", "value": "替代程序",   "note": "未回函，但期后回单已核查"},
            ],
        ),
    ]

    return FillResult(
        paper_index="A1",
        sheet_data=sheet_data,
        decisions=decisions,
        fill_summary=(
            f"AI已完成货币资金底稿草稿。账面余额¥{total:,.0f}（现金¥{cash:,.0f} + "
            f"银行存款¥{bank:,.0f} + 其他货币资金¥{other:,.0f}）。"
            "已识别2项需人工判断：①其他货币资金受限情况 ②银行函证结果确认。"
        ),
    )


def resume_A1(sheet_data: dict, decisions: dict) -> dict:
    sd = copy.deepcopy(sheet_data)
    restricted = decisions.get("A1-restricted-funds", "无受限")
    confirm    = decisions.get("A1-bank-confirmation", "函证一致")

    sd["conclusion"]["restricted_amount"] = {
        "无受限":    "¥0（已核查，其他货币资金¥500,000均可自由支配）",
        "部分受限":  "【部分受限，具体金额待填写】",
        "全部受限":  "¥500,000（全部受限，需重分类至非流动资产或受限资金科目）",
    }.get(restricted, "待核查")

    sd["conclusion"]["bank_confirmation_result"] = {
        "函证一致":      "已完成。全部开户行回函，余额与账面一致，无差异。",
        "函证差异已调节": "已完成。函证存在差异，已执行差异调节，调节后余额一致。",
        "替代程序":      "已完成。部分函证未回，已审阅期后银行回单作为替代程序，结论一致。",
    }.get(confirm, "待完成")

    sd["conclusion"]["audit_result"] = "通过" if confirm != "替代程序" else "通过（依据替代程序）"
    return sd


# ─── A6 应收账款 ─────────────────────────────────────────────────────

def fill_A6() -> FillResult:
    total = 12_345_678
    ar    = AR_DETAIL

    # 账龄分析
    buckets = [
        ("0-30天",   lambda d: d <= 30,         "1%"),
        ("31-90天",  lambda d: 31 <= d <= 90,   "5%"),
        ("91-180天", lambda d: 91 <= d <= 180,  "20%"),
        (">180天",   lambda d: d > 180,          "50%"),
    ]
    aging_rows = []
    for label, pred, rate in buckets:
        bal = sum(r["balance"] for r in ar if pred(r["overdue_days"]))
        aging_rows.append({
            "aging_bucket": label,
            "balance":      bal,
            "pct_of_total": f"{bal / total * 100:.1f}%",
            "provision_rate_ref": rate,
            "estimated_provision": round(bal * float(rate.strip("%")) / 100),
        })

    overdue_90  = sum(r["balance"] for r in ar if r["overdue_days"] > 90)
    related_bal = sum(r["balance"] for r in ar if r["related"])
    total_est_provision = sum(row["estimated_provision"] for row in aging_rows)

    sheet_data = {
        "summary": {
            "book_balance":           total,
            "related_party_balance":  related_bal,
            "overdue_over_90d":       overdue_90,
            "overdue_over_90d_pct":   f"{overdue_90 / total * 100:.1f}%",
            "est_provision_aging":    total_est_provision,
            "audit_objective":        "确认应收账款余额真实性、完整性、账龄准确性及坏账准备充分性",
        },
        "aging_analysis": {"rows": aging_rows},
        "customer_detail": {
            "rows": [
                {
                    "customer":            r["name"],
                    "balance":             r["balance"],
                    "overdue_days":        r["overdue_days"],
                    "related_party":       "是" if r["related"] else "否",
                    "confirmation_status": "待函证",
                    "risk_note":           (
                        "关联方，需核查定价公允性" if r["related"]
                        else ("高风险，账龄超180天" if r["overdue_days"] > 180
                              else ("关注，账龄91-180天" if r["overdue_days"] > 90 else ""))
                    ),
                }
                for r in ar
            ]
        },
        "audit_procedures_plan": {
            "rows": [
                {"procedure": "账龄分析",    "scope": "全部余额",
                 "status": "AI已完成",       "responsible": "AI",
                 "note": f"AI按账龄分4档，估计坏账准备¥{total_est_provision:,.0f}，需人工确认计提政策"},
                {"procedure": "函证",        "scope": "前5大客户（占比约94%）",
                 "status": "待执行",         "responsible": "人工",
                 "note": "向C001-C005发函证，关联方（斑华科技）单独函证"},
                {"procedure": "关联方核查",  "scope": "斑华科技¥1,234,567",
                 "status": "待判断",         "responsible": "人工",
                 "note": "确认合同独立性、服务交付证明及定价公允性"},
                {"procedure": "截止性测试",  "scope": "12月末前后凭证",
                 "status": "待执行",         "responsible": "人工",
                 "note": "核查收入确认时点与合同交付节点是否匹配"},
                {"procedure": "期后收款核查","scope": "成都天枢¥1,567,890（账龄156天）",
                 "status": "待执行",         "responsible": "人工",
                 "note": "1-2月是否已收款，否则需评估坏账风险"},
            ]
        },
        "conclusion": {
            "book_balance":    total,
            "bad_debt_provision": "【待人工确认计提政策后填写】",
            "net_balance":     "【待填】",
            "risk_assessment": "高",
            "key_risk":        f"成都天枢账龄156天（¥1,567,890）；关联方应收¥{related_bal:,.0f}",
        },
    }

    decisions = [
        FillDecision(
            key="A6-provision-policy",
            paper_index="A6",
            cell_path="conclusion.bad_debt_provision",
            question="请确认坏账准备计提政策及本期应计提金额",
            context=(
                "AI已按账龄法估计坏账准备如下：\n\n"
                + "\n".join(
                    f"• {row['aging_bucket']}（余额¥{row['balance']:,.0f}）× {row['provision_rate_ref']}"
                    f" = ¥{row['estimated_provision']:,.0f}"
                    for row in aging_rows
                )
                + f"\n\n**合计估计坏账准备：¥{total_est_provision:,.0f}**\n\n"
                "注意：上述仅为AI参考估算，实际应以**公司会计政策规定的计提比例**为准。\n"
                "请核查：①公司坏账准备计提政策文件 ②账面已提坏账准备余额 ③与AI估算的差异。"
            ),
            options=[
                {"label": f"按账龄法，采用AI估算¥{total_est_provision:,.0f}（推荐）",
                 "value": str(total_est_provision),
                 "note": "以AI账龄分析为基础，符合账龄法计提政策"},
                {"label": "按公司政策另行计算（金额需补充）",
                 "value": "按公司政策",
                 "note": "公司有自己的计提比例，以实际计算为准"},
                {"label": "无需计提（余额可全额收回）",
                 "value": "0",
                 "note": "已评估，所有客户可收回，无需计提"},
            ],
        ),
        FillDecision(
            key="A6-related-party-ar",
            paper_index="A6",
            cell_path="customer_detail",
            question="请确认关联方（斑华科技）应收款项是否有独立合同支持且定价公允",
            context=(
                "AI识别到关联方应收账款：\n\n"
                "• **无锡斑华科技有限公司**（同一实际控制人陈伟峰控制）\n"
                "• 期末余额 ¥1,234,567，账龄0天（2024-12-15开票）\n"
                "• 交易类型：软件服务销售\n\n"
                "需要取得并审阅：\n"
                "① 独立服务合同（确认服务内容和交付节点）\n"
                "② 服务交付证明（验收单、系统上线记录等）\n"
                "③ 与非关联方同类合同的价格对比（定价公允性）"
            ),
            options=[
                {"label": "有合同，服务已交付，定价公允",  "value": "公允",
                 "note": "已取得合同和交付证明，定价与市场价格相符"},
                {"label": "有合同但定价偏高，需调查",      "value": "定价偏高",
                 "note": "与非关联方价格对比存在差异，需进一步评估"},
                {"label": "无独立合同或证据不足",          "value": "证据不足",
                 "note": "应收款依据不充分，需补充证据或考虑调整"},
            ],
        ),
        FillDecision(
            key="A6-tianshu-recovery",
            paper_index="A6",
            cell_path="conclusion.key_risk",
            question="请评估成都天枢（账龄156天，¥1,567,890）的可回收性",
            context=(
                "AI识别高风险应收账款：\n\n"
                "• **成都天枢软件有限公司**\n"
                "• 期末余额 ¥1,567,890，账龄156天（2024-07-20开票）\n"
                "• 账龄已超90天，按20%估计坏账准备¥313,578\n\n"
                "需要执行：\n"
                "① 核查2025年1-2月是否已收款（期后收款核查）\n"
                "② 向客户发函证确认余额\n"
                "③ 了解逾期原因（付款纠纷/资金困难/正常付款周期）"
            ),
            options=[
                {"label": "期后已收款，可全额收回",          "value": "已回收",
                 "note": "已核查，2025年1-2月已到账，无坏账风险"},
                {"label": "尚未收款，但客户有还款计划",      "value": "计划中",
                 "note": "客户已确认，还款计划可信，按正常账龄计提即可"},
                {"label": "存在坏账风险，需追加计提",        "value": "高风险",
                 "note": "回收不确定，建议按50%甚至100%计提坏账准备"},
            ],
        ),
    ]

    return FillResult(
        paper_index="A6",
        sheet_data=sheet_data,
        decisions=decisions,
        fill_summary=(
            f"AI已完成应收账款底稿草稿。账面余额¥{total:,.0f}，"
            f"账龄>90天¥{overdue_90:,.0f}（{overdue_90/total*100:.0f}%），"
            f"关联方¥{related_bal:,.0f}，估计坏账准备¥{total_est_provision:,.0f}。"
            "已识别3项需人工判断：①坏账准备计提政策 ②关联方应收款公允性 ③成都天枢可回收性。"
        ),
    )


def resume_A6(sheet_data: dict, decisions: dict) -> dict:
    sd = copy.deepcopy(sheet_data)
    provision_decision = decisions.get("A6-provision-policy", "按公司政策")
    related_decision   = decisions.get("A6-related-party-ar", "公允")
    tianshu_decision   = decisions.get("A6-tianshu-recovery", "计划中")

    if provision_decision.isdigit() or provision_decision.replace(",", "").isdigit():
        prov_amount = int(provision_decision.replace(",", ""))
        sd["conclusion"]["bad_debt_provision"] = prov_amount
        sd["conclusion"]["net_balance"] = 12_345_678 - prov_amount
    elif provision_decision == "0":
        sd["conclusion"]["bad_debt_provision"] = 0
        sd["conclusion"]["net_balance"] = 12_345_678
    else:
        sd["conclusion"]["bad_debt_provision"] = "【按公司政策计算，需补充金额】"
        sd["conclusion"]["net_balance"] = "【待填】"

    sd["conclusion"]["related_party_conclusion"] = {
        "公允":   "关联方应收账款定价公允，已取得独立合同和服务交付证明。",
        "定价偏高": "关联方应收账款定价偏高，需进一步评估或考虑审计调整。",
        "证据不足": "关联方应收账款证据不足，列入待解决事项，审计结论暂缓。",
    }.get(related_decision, "待完成")

    sd["conclusion"]["tianshu_assessment"] = {
        "已回收": "成都天枢期后已收款，无坏账风险，按正常处理。",
        "计划中": "成都天枢尚未收款但有还款计划，按账龄法计提即可。",
        "高风险": "成都天枢存在重大坏账风险，建议追加计提坏账准备。",
    }.get(tianshu_decision, "待评估")

    return sd


# ─── A9 其他应收款 ────────────────────────────────────────────────────

def fill_A9() -> FillResult:
    total     = 456_789
    chen_loan = 234_567   # 陈伟峰个人借款
    other_bal = total - chen_loan   # 222,222 备用金等

    sheet_data = {
        "summary": {
            "book_balance":       total,
            "key_items":          f"含法定代表人陈伟峰个人借款¥{chen_loan:,.0f}（占{chen_loan/total*100:.0f}%）",
            "audit_objective":    "确认其他应收款的真实性、合法性及可回收性；重点关注法人借款合规性",
        },
        "detail": {
            "rows": [
                {
                    "payee":           "陈伟峰（法定代表人/控股股东）",
                    "nature":          "个人借款",
                    "amount":          chen_loan,
                    "aging_months":    "12个月以上",
                    "has_agreement":   "【待核查】",
                    "repayment_plan":  "【待询问】",
                    "risk_assessment": "高",
                    "compliance_note": "法人向公司借款需符合公司章程规定；超过一年未还需关注资金占用问题",
                },
                {
                    "payee":           "员工备用金及押金（合计）",
                    "nature":          "备用金/押金",
                    "amount":          other_bal,
                    "aging_months":    "1-3个月",
                    "has_agreement":   "—",
                    "repayment_plan":  "报销后冲销",
                    "risk_assessment": "低",
                    "compliance_note": "正常备用金管理",
                },
            ]
        },
        "audit_procedures_plan": {
            "rows": [
                {"procedure": "函证",     "scope": f"陈伟峰¥{chen_loan:,.0f}",
                 "status": "待执行",      "responsible": "人工",
                 "note": "向法定代表人发函确认借款余额及还款计划"},
                {"procedure": "合规性检查", "scope": "法定代表人借款",
                 "status": "待执行",      "responsible": "人工",
                 "note": "查阅公司章程，确认是否需要股东会/董事会审批；检查是否违反公司法第148条"},
                {"procedure": "备用金核查", "scope": f"备用金等¥{other_bal:,.0f}",
                 "status": "待执行",      "responsible": "人工",
                 "note": "核查报销单据完整性及期后冲销情况"},
            ]
        },
        "conclusion": {
            "book_balance":      total,
            "related_party_amt": chen_loan,
            "risk_assessment":   "中",
            "key_concern":       "法定代表人借款¥234,567已超12个月，需评估可回收性和合规性",
            "audit_result":      "【待人工确认后填写】",
        },
    }

    decisions = [
        FillDecision(
            key="A9-ceo-loan-compliance",
            paper_index="A9",
            cell_path="conclusion.audit_result",
            question="请确认法定代表人陈伟峰借款（¥234,567）的合规性及处理方式",
            context=(
                "AI从CLIENT_MATERIALS识别到：\n\n"
                "• **陈伟峰**（法定代表人 / 控股股东）\n"
                "• 其他应收款余额 ¥234,567，账龄12个月以上\n"
                "• 性质：个人借款\n\n"
                "需要核查：\n"
                "① 公司章程是否授权法定代表人向公司借款\n"
                "② 是否有股东会/董事会决议\n"
                "③ 是否签署了借款协议（含利率和还款期）\n"
                "④ 期后是否已还款\n\n"
                "注意：《公司法》第148条禁止董事/高管违反章程规定从公司借款。"
            ),
            options=[
                {"label": "有授权文件，有借款协议，合规",
                 "value": "合规",
                 "note": "章程授权，有协议，合规，按正常往来处理"},
                {"label": "无正式授权，但期后已还款",
                 "value": "已还款",
                 "note": "程序有瑕疵，但已还款，风险较低，建议披露"},
                {"label": "存在合规风险，需与管理层沟通",
                 "value": "合规风险",
                 "note": "可能违反公司法，列入审计发现，需管理层出具书面确认"},
            ],
        ),
    ]

    return FillResult(
        paper_index="A9",
        sheet_data=sheet_data,
        decisions=decisions,
        fill_summary=(
            f"AI已完成其他应收款底稿草稿。账面余额¥{total:,.0f}，"
            f"其中法定代表人陈伟峰个人借款¥{chen_loan:,.0f}（高风险，账龄超12月）。"
            "需人工确认：①借款合规性（公司法/章程审查） ②函证余额 ③是否已还款。"
        ),
    )


def resume_A9(sheet_data: dict, decisions: dict) -> dict:
    sd = copy.deepcopy(sheet_data)
    compliance = decisions.get("A9-ceo-loan-compliance", "合规风险")
    sd["conclusion"]["compliance_result"] = {
        "合规":     "陈伟峰借款有授权文件和借款协议，合规，按正常往来处理。",
        "已还款":   "陈伟峰借款无正式授权，但已于期后还款，风险低，建议在附注中披露。",
        "合规风险": "陈伟峰借款存在合规风险，已列入审计发现，需管理层出具书面承诺函。",
    }.get(compliance, "待确认")
    sd["conclusion"]["audit_result"] = "通过（有附注披露）" if compliance in ("合规", "已还款") else "待解决"
    return sd


# ─── A10 存货 ─────────────────────────────────────────────────────────

def fill_A10() -> FillResult:
    # TB中无存货科目余额（软件服务企业）
    sheet_data = {
        "summary": {
            "book_balance":    0,
            "industry_note":   "软件信息服务行业，期末无实物存货",
            "audit_objective": "确认存货余额为零的合理性；排查软件在制品/合同资产是否被误入存货科目",
        },
        "ai_analysis": {
            "rows": [
                {"item": "实物存货",       "tb_balance": 0, "risk": "低",
                 "ai_finding": "TB无存货科目，符合软件服务行业特征，无实物商品库存"},
                {"item": "软件开发在制品", "tb_balance": 0, "risk": "中",
                 "ai_finding": "需询问管理层：是否存在未完工软件项目；若有，确认是否已正确归入合同资产（IFRS15/企业会计准则第14号）或研发支出科目"},
                {"item": "低值易耗品",     "tb_balance": 0, "risk": "低",
                 "ai_finding": "员工设备等通常计入固定资产，当期无低值易耗品余额"},
            ]
        },
        "audit_procedures_plan": {
            "rows": [
                {"procedure": "询问管理层", "scope": "软件在制品",
                 "status": "待执行",        "responsible": "人工",
                 "note": "询问是否存在未完工项目及会计处理方式"},
                {"procedure": "合同资产核查", "scope": "与D1收入联动",
                 "status": "待执行",          "responsible": "人工",
                 "note": "核查D1收入确认与合同资产/负债是否匹配，无应结转未结转情形"},
            ]
        },
        "conclusion": {
            "book_balance":    0,
            "risk_assessment": "低",
            "conclusion_text": "存货余额为零，符合软件服务行业特征。主要风险在于软件在制品的归类处理，已列入D1收入科目联动核查。",
        },
    }

    decisions = [
        FillDecision(
            key="A10-wip-inquiry",
            paper_index="A10",
            cell_path="conclusion.conclusion_text",
            question="询问管理层：期末是否存在未完工软件项目，如有，如何进行会计处理？",
            context=(
                "AI从TB账套确认无存货余额（1401、1402、1405存货类科目余额为零）。\n\n"
                "对于软件服务企业，需排查：\n"
                "• 期末是否有尚未通过客户验收的软件项目（未完工在制品）\n"
                "• 若有，是否已按收入准则正确归入「合同资产」或「研发支出」\n"
                "• 是否存在将在制品错入存货或预付账款的情形\n\n"
                "请告知管理层询问结果。"
            ),
            options=[
                {"label": "无未完工项目，所有合同均已完工交付",
                 "value": "无在制品",
                 "note": "期末无在制品，收入已全部确认，存货零余额合理"},
                {"label": "有未完工项目，已正确列入合同资产",
                 "value": "合同资产",
                 "note": "在制品已列入合同资产，需与资产负债表核对"},
                {"label": "有未完工项目，计入研发支出",
                 "value": "研发支出",
                 "note": "已在研发支出科目，需确认资本化条件是否满足"},
            ],
        ),
    ]

    return FillResult(
        paper_index="A10",
        sheet_data=sheet_data,
        decisions=decisions,
        fill_summary=(
            "AI已确认存货TB余额为零，符合软件服务行业特征。"
            "需人工询问管理层：①是否有未完工软件项目 ②在制品会计处理方式。"
        ),
    )


def resume_A10(sheet_data: dict, decisions: dict) -> dict:
    sd = copy.deepcopy(sheet_data)
    wip = decisions.get("A10-wip-inquiry", "无在制品")
    sd["conclusion"]["wip_inquiry_result"] = {
        "无在制品": "管理层确认：期末无未完工项目，所有合同均已完工交付，存货零余额合理。",
        "合同资产": "管理层确认：期末存在未完工项目，已正确列入合同资产科目，需与资产负债表核对。",
        "研发支出": "管理层确认：期末在制品计入研发支出，需核查资本化条件是否符合准则要求。",
    }.get(wip, "待完成")
    sd["conclusion"]["conclusion_text"] = (
        f"存货余额为零，{sd['conclusion']['wip_inquiry_result']}"
    )
    return sd


# ─── A24 固定资产 ─────────────────────────────────────────────────────

def fill_A24() -> FillResult:
    cost       = next(r["balance"] for r in TB if r["code"] == "1606")   # 3,456,789
    accum_depr = abs(next(r["balance"] for r in TB if r["code"] == "1608"))  # 1,234,567
    net        = cost - accum_depr   # 2,222,222
    depr_rate  = accum_depr / cost   # ≈35.7%

    # AI估算年折旧额（基于3-5年直线法）
    ai_est_annual_depr_3y = round(cost / 3)
    ai_est_annual_depr_5y = round(cost / 5)

    sheet_data = {
        "summary": {
            "original_cost":          cost,
            "accumulated_depreciation": accum_depr,
            "net_book_value":          net,
            "depreciation_rate":       f"{depr_rate * 100:.1f}%",
            "audit_objective":         "确认固定资产原值的存在性；折旧计提方法和年限的恰当性；期末净值的准确性",
        },
        "composition_estimate": {
            "rows": [
                {"asset_category": "电子设备（服务器、工作站、电脑）",
                 "est_original_cost": 2_100_000, "est_accum_depr": 820_000, "est_net": 1_280_000,
                 "typical_life": "3-5年", "note": "主要资产，AI根据比例估算"},
                {"asset_category": "办公设备及家具",
                 "est_original_cost": 456_789, "est_accum_depr": 200_000, "est_net": 256_789,
                 "typical_life": "5年", "note": "AI估算"},
                {"asset_category": "装修及改良工程",
                 "est_original_cost": 900_000, "est_accum_depr": 214_567, "est_net": 685_433,
                 "typical_life": "5年（租赁期）", "note": "需确认租赁是否到期"},
            ]
        },
        "depreciation_analysis": {
            "method":                     "直线法（假设，需核查公司政策）",
            "ai_est_annual_depr_3yr_life": ai_est_annual_depr_3y,
            "ai_est_annual_depr_5yr_life": ai_est_annual_depr_5y,
            "book_depreciation_expense":  "【待从账套提取D类科目折旧金额】",
            "difference":                 "【待计算：账面 vs AI估算】",
            "ai_note":                    (
                f"AI按全部资产3年/5年折旧分别估算年折旧额¥{ai_est_annual_depr_3y:,.0f}~"
                f"¥{ai_est_annual_depr_5y:,.0f}；需与账簿折旧金额核对，差异超过TE需调查原因。"
            ),
        },
        "audit_procedures_plan": {
            "rows": [
                {"procedure": "固定资产盘点",   "scope": "重要固定资产（>¥50,000）",
                 "status": "待执行",            "responsible": "人工",
                 "note": "重点盘点服务器等高值IT设备；填写盘点记录表"},
                {"procedure": "折旧重算",       "scope": "全部固定资产",
                 "status": "AI已初步估算",       "responsible": "人工确认",
                 "note": "以公司折旧政策重算，并与账面对比；差异需调查"},
                {"procedure": "新增固定资产检查", "scope": "当期新增",
                 "status": "待执行",              "responsible": "人工",
                 "note": "取得发票、合同，核查是否满足资本化条件"},
                {"procedure": "处置/报废核查",  "scope": "当期减少",
                 "status": "待执行",            "responsible": "人工",
                 "note": "检查处置损益是否合规入账；是否已办理资产报废手续"},
            ]
        },
        "conclusion": {
            "original_cost":             cost,
            "accumulated_depreciation":  accum_depr,
            "net_book_value":            net,
            "risk_assessment":           "低",
            "depreciation_policy":       "【待人工确认折旧政策后填写】",
            "inventory_result":          "【待盘点完成后填写】",
        },
    }

    decisions = [
        FillDecision(
            key="A24-depreciation-policy",
            paper_index="A24",
            cell_path="conclusion.depreciation_policy",
            question="请确认公司固定资产折旧政策（折旧方法、各类资产使用年限）",
            context=(
                f"AI从TB读取：固定资产原值¥{cost:,.0f}，累计折旧¥{accum_depr:,.0f}，"
                f"已计提折旧率{depr_rate*100:.1f}%。\n\n"
                "AI按直线法估算年折旧额：\n"
                f"• 若全部按3年：年折旧约¥{ai_est_annual_depr_3y:,.0f}\n"
                f"• 若全部按5年：年折旧约¥{ai_est_annual_depr_5y:,.0f}\n\n"
                "需取得：\n"
                "① 公司固定资产折旧政策文件（会计手册/历年审计报告）\n"
                "② 固定资产明细表（含各资产购置日期、使用年限、折旧率）\n"
                "③ 当期折旧费用金额（与管理费用/成本中折旧科目核对）"
            ),
            options=[
                {"label": "IT设备3年、其他5年，直线法（推荐参考）",
                 "value": "IT3年其他5年",
                 "note": "软件企业常见政策，已取得公司折旧政策确认"},
                {"label": "全部5年，直线法",
                 "value": "全部5年",
                 "note": "以5年统一折旧"},
                {"label": "另有公司特定政策（需补充说明）",
                 "value": "其他政策",
                 "note": "公司有特定折旧政策，请在备注中补充"},
            ],
        ),
        FillDecision(
            key="A24-inventory-result",
            paper_index="A24",
            cell_path="conclusion.inventory_result",
            question="请确认固定资产实地盘点结果",
            context=(
                f"AI已列出固定资产组成估算（原值¥{cost:,.0f}，净值¥{net:,.0f}）。\n\n"
                "实地盘点要求：\n"
                "① 对账面列示的重要固定资产逐一盘点（重点：服务器、IT设备）\n"
                "② 检查是否有账外资产（已使用但未入账）\n"
                "③ 检查是否有已处置但账面未注销的资产\n"
                "④ 填写盘点记录表，注明盘点日期和盘点人"
            ),
            options=[
                {"label": "盘点完成，账实一致",
                 "value": "账实一致",
                 "note": "已盘点，无差异，固定资产实际存在"},
                {"label": "盘点完成，存在差异（已说明）",
                 "value": "存在差异",
                 "note": "有账实不符，差异原因已在底稿中记录"},
                {"label": "未盘点（已执行替代程序）",
                 "value": "替代程序",
                 "note": "未实地盘点，以购置发票+折旧凭证作为替代"},
            ],
        ),
    ]

    return FillResult(
        paper_index="A24",
        sheet_data=sheet_data,
        decisions=decisions,
        fill_summary=(
            f"AI已完成固定资产底稿草稿。原值¥{cost:,.0f}，累计折旧¥{accum_depr:,.0f}，"
            f"净值¥{net:,.0f}，折旧率{depr_rate*100:.1f}%。"
            "需人工确认：①折旧政策（年限/方法）并重算 ②实地盘点结果。"
        ),
    )


def resume_A24(sheet_data: dict, decisions: dict) -> dict:
    sd = copy.deepcopy(sheet_data)
    depr_policy    = decisions.get("A24-depreciation-policy", "其他政策")
    inventory_rslt = decisions.get("A24-inventory-result", "账实一致")

    sd["conclusion"]["depreciation_policy"] = {
        "IT3年其他5年": "IT设备3年，办公设备和装修5年，直线法，残值率5%。",
        "全部5年":      "全部固定资产5年直线法，残值率5%。",
        "其他政策":     "【公司特定折旧政策，需补充】",
    }.get(depr_policy, depr_policy)

    sd["conclusion"]["inventory_result"] = {
        "账实一致": "已完成实地盘点，账实一致，固定资产存在性已确认。",
        "存在差异": "实地盘点存在差异，差异原因已记录，需评估是否需要审计调整。",
        "替代程序": "未进行实地盘点，已以购置发票和折旧凭证作为替代程序，结论有限。",
    }.get(inventory_rslt, "待完成")
    return sd


# ─── B1 银行借款 ──────────────────────────────────────────────────────

def fill_B1() -> FillResult:
    lt_loan    = abs(next(r["balance"] for r in TB if r["code"] == "2501"))  # 2,000,000
    fin_cost   = next(r["balance"] for r in TB if r["code"] == "6603")       # 123,456
    # 无短期借款科目（2001）在TB中

    sheet_data = {
        "summary": {
            "short_term_loans":    0,
            "long_term_loans":     lt_loan,
            "total_borrowings":    lt_loan,
            "finance_cost_book":   fin_cost,
            "audit_objective":     "确认借款余额真实性；核查借款合同条款；验证利息费用完整性及截止性",
        },
        "loan_detail": {
            "rows": [
                {"lender": "【待询问管理层：开户行名称】", "loan_type": "长期借款",
                 "principal": lt_loan, "interest_rate": "【待取合同】",
                 "start_date": "【待取合同】", "maturity_date": "【待取合同】",
                 "collateral": "【待询问：是否有抵押/担保】",
                 "covenants":  "【待核查：是否含财务条款约束】"},
            ]
        },
        "interest_verification": {
            "book_finance_cost":          fin_cost,
            "ai_note":                    (
                f"账面财务费用¥{fin_cost:,.0f}。AI无法从账套直接推算利率（需借款合同）。"
                "取得合同后：利率 × 本金 × 月份数 = 应计利息，与账面核对。"
            ),
            "ai_est_interest":            "【待取合同利率后计算】",
            "difference":                 "【待计算】",
        },
        "audit_procedures_plan": {
            "rows": [
                {"procedure": "银行函证",     "scope": f"全部借款（随货币资金函证一并发出）",
                 "status": "待执行",          "responsible": "人工",
                 "note": "函证内容包括：余额、利率、到期日、抵押情况、或有事项"},
                {"procedure": "合同条款审阅", "scope": "借款合同原件",
                 "status": "待执行",          "responsible": "人工",
                 "note": "核查关键条款：金额、利率、还款方式、抵押品、财务契约条款"},
                {"procedure": "利息重算",     "scope": "全年利息费用",
                 "status": "待取合同后执行",  "responsible": "人工",
                 "note": f"合同利率×本金×期间 vs 账面财务费用¥{fin_cost:,.0f}"},
                {"procedure": "到期日核查",   "scope": "长期借款分类",
                 "status": "待执行",          "responsible": "人工",
                 "note": "确认1年内到期部分是否需重分类至流动负债"},
            ]
        },
        "conclusion": {
            "total_borrowings":  lt_loan,
            "finance_cost":      fin_cost,
            "risk_assessment":   "低",
            "contract_terms":    "【待取合同后填写】",
            "interest_verified": "【待利息重算后填写】",
            "audit_result":      "【待函证完成后填写】",
        },
    }

    decisions = [
        FillDecision(
            key="B1-contract-terms",
            paper_index="B1",
            cell_path="conclusion.contract_terms",
            question="请取得并审阅借款合同，确认关键条款（利率、到期日、抵押品、财务契约）",
            context=(
                f"AI从TB读取：长期借款余额¥{lt_loan:,.0f}，账面财务费用¥{fin_cost:,.0f}。\n\n"
                "执行记录显示客户已提供借款合同文件（工行300万、中行、农行），请审阅：\n"
                "• 借款总额及开户行\n"
                "• 利率（固定/浮动）\n"
                "• 到期日（是否有1年内到期部分需重分类）\n"
                "• 抵押/担保安排\n"
                "• 财务契约条款（debt covenants）"
            ),
            options=[
                {"label": "合同已审阅，¥2,000,000分属多行，无1年内到期",
                 "value": "已审阅无重分类",
                 "note": "全部为长期借款，无需重分类至流动负债"},
                {"label": "合同已审阅，部分1年内到期，需重分类",
                 "value": "需重分类",
                 "note": "有1年内到期部分，需重分类至流动负债科目"},
                {"label": "合同未取到，执行替代程序",
                 "value": "替代程序",
                 "note": "以银行函证和资金划转记录作为替代程序"},
            ],
        ),
        FillDecision(
            key="B1-interest-check",
            paper_index="B1",
            cell_path="conclusion.interest_verified",
            question="请确认利息重算结果：账面财务费用是否与借款合同测算一致",
            context=(
                f"账面财务费用：¥{fin_cost:,.0f}\n\n"
                "取得合同利率后，执行：\n"
                "• 各借款：本金 × 年利率 × 实际借款月份/12 = 应计利息\n"
                "• 合计后与账面¥{fin_cost:,.0f}对比\n"
                "• 差异超过执行重要性（TE）需分析原因\n\n"
                "注意：长期借款利息需区分资本化部分（如无在建工程则全部费用化）。"
            ),
            options=[
                {"label": "重算一致，无重大差异",
                 "value": "一致",
                 "note": "合同测算与账面财务费用基本一致"},
                {"label": "重算存在差异，已调查原因",
                 "value": "差异已调查",
                 "note": "差异原因已记录（如利率调整、提前还款等），无需调整"},
                {"label": "重算差异较大，需考虑审计调整",
                 "value": "需调整",
                 "note": "差异超过TE，建议调整财务费用"},
            ],
        ),
    ]

    return FillResult(
        paper_index="B1",
        sheet_data=sheet_data,
        decisions=decisions,
        fill_summary=(
            f"AI已完成银行借款底稿草稿。长期借款¥{lt_loan:,.0f}（无短期借款），"
            f"账面财务费用¥{fin_cost:,.0f}。"
            "需人工：①取合同审阅关键条款 ②执行利息重算 ③银行函证。"
        ),
    )


def resume_B1(sheet_data: dict, decisions: dict) -> dict:
    sd = copy.deepcopy(sheet_data)
    contract = decisions.get("B1-contract-terms", "已审阅无重分类")
    interest = decisions.get("B1-interest-check", "一致")

    sd["conclusion"]["contract_terms"] = {
        "已审阅无重分类": "合同已审阅，¥2,000,000均为长期借款，无1年内到期部分需重分类。",
        "需重分类":        "合同已审阅，存在1年内到期部分，需重分类至流动负债；审计调整列入Z6。",
        "替代程序":        "合同未取到，已以函证和资金记录作为替代程序，结论有限。",
    }.get(contract, contract)

    sd["conclusion"]["interest_verified"] = {
        "一致":      "利息重算与账面财务费用基本一致，无需调整。",
        "差异已调查": "利息重算存在差异，差异原因已记录，差异在可接受范围内，无需调整。",
        "需调整":    "利息重算差异超过TE，建议调整财务费用，已列入Z6审计调整表。",
    }.get(interest, interest)
    return sd


# ─── B9 应付职工薪酬 ─────────────────────────────────────────────────

def fill_B9() -> FillResult:
    balance   = abs(next(r["balance"] for r in TB if r["code"] == "2221"))  # 1,456,789
    employees = COMPANY_INFO["employees"]   # 68
    per_person_est = round(balance / employees)   # ≈21,423/人

    # 估算构成
    salary_amt = round(balance * 0.85)   # 工资奖金
    social_amt = round(balance * 0.10)   # 社保
    other_amt  = balance - salary_amt - social_amt  # 其他福利

    sheet_data = {
        "summary": {
            "book_balance":          balance,
            "employee_count":        employees,
            "est_per_person_monthly": per_person_est,
            "audit_objective":       "确认应付职工薪酬余额准确性；验证薪酬费用完整性及期后支付",
        },
        "composition_estimate": {
            "rows": [
                {"component": "工资及年终奖（估）", "amount": salary_amt,
                 "pct": f"{salary_amt/balance*100:.0f}%", "note": "含12月工资及应计年终奖"},
                {"component": "社会保险（估）",     "amount": social_amt,
                 "pct": f"{social_amt/balance*100:.0f}%", "note": "单位承担部分：养老、医疗、失业、工伤、生育"},
                {"component": "其他福利（估）",     "amount": other_amt,
                 "pct": f"{other_amt/balance*100:.0f}%", "note": "通讯补贴、餐补、公积金等"},
            ]
        },
        "analytical_procedures": {
            "book_balance":           balance,
            "employee_count":         employees,
            "est_per_person_monthly": per_person_est,
            "reasonableness_flag":    "偏高，需核查" if per_person_est > 25_000 else "合理",
            "ai_finding":             (
                f"AI测算期末人均应付薪酬约¥{per_person_est:,.0f}/人（{employees}人）。"
                "软件信息服务行业平均月薪参考区间：¥10,000~¥30,000。"
                "期末余额通常约等于12月份工资及年终奖计提，需与HR系统及工资表核对。"
            ),
        },
        "social_insurance_check": {
            "ai_note": (
                "执行记录显示已取得社保缴纳记录（1-12月单位权益单）。"
                "需核对：①各月单位承担社保金额 ②是否有漏缴月份 ③社保缴费基数合规性。"
            ),
            "status": "待人工核对",
        },
        "audit_procedures_plan": {
            "rows": [
                {"procedure": "分析性程序",   "scope": "全年薪酬总额",
                 "status": "AI已完成",        "responsible": "AI",
                 "note": f"人均月薪¥{per_person_est:,.0f}，需与HR数据核对合理性"},
                {"procedure": "工资表核查",   "scope": "12月份工资单",
                 "status": "待执行",          "responsible": "人工",
                 "note": "取得12月份工资明细，核对实发和应付金额，匹配员工名单"},
                {"procedure": "期后付款核查", "scope": "1月初实际发薪",
                 "status": "待执行",          "responsible": "人工",
                 "note": "核查12月薪酬是否已于2025年1月正常支付（完整性）"},
                {"procedure": "社保核对",     "scope": "社保缴纳记录",
                 "status": "待执行",          "responsible": "人工",
                 "note": "以单位权益单与账面核对；检查是否存在漏缴"},
            ]
        },
        "conclusion": {
            "book_balance":           balance,
            "risk_assessment":        "低",
            "analytical_result":      "【待工资表核查后填写】",
            "post_payment_verified":  "【待期后付款核查后填写】",
            "audit_result":           "【待完成后填写】",
        },
    }

    decisions = [
        FillDecision(
            key="B9-payroll-reasonableness",
            paper_index="B9",
            cell_path="conclusion.analytical_result",
            question="请核查12月工资表，确认应付薪酬余额与工资表匹配",
            context=(
                f"AI分析性程序结果：\n\n"
                f"• 期末应付职工薪酬：¥{balance:,.0f}\n"
                f"• 员工人数：{employees}人\n"
                f"• 人均月薪估算：¥{per_person_est:,.0f}\n\n"
                "请执行：\n"
                "① 取得12月份工资明细表（含员工姓名、岗位、税前/税后工资）\n"
                "② 核对工资表合计与账面应付职工薪酬的差异（注意：还需含社保和年终奖计提）\n"
                "③ 与花名册核对员工人数是否一致\n"
                "④ 检查是否有离职员工工资尚未支付"
            ),
            options=[
                {"label": "工资表已核查，余额匹配，人员无异常",
                 "value": "匹配",
                 "note": "账面与工资表一致，员工名单无异常"},
                {"label": "工资表已核查，有差异（差异原因已记录）",
                 "value": "差异已记录",
                 "note": "差异金额和原因已记录，差异在TE以内"},
                {"label": "工资表未取到，执行替代程序",
                 "value": "替代程序",
                 "note": "以社保记录和1月发薪银行记录作为替代"},
            ],
        ),
        FillDecision(
            key="B9-post-payment",
            paper_index="B9",
            cell_path="conclusion.post_payment_verified",
            question="请确认12月薪酬的期后支付情况（完整性验证）",
            context=(
                f"应付职工薪酬余额¥{balance:,.0f}应在2025年1月发薪时转出。\n\n"
                "请核查：\n"
                "• 银行流水：2025年1月发薪银行付款金额\n"
                "• 与账面余额对比：是否已全额支付\n"
                "• 如存在未付部分，原因是什么（年终奖分批支付？离职纠纷？）"
            ),
            options=[
                {"label": "期后已全额支付，完整性确认",
                 "value": "已支付",
                 "note": "1月银行记录已核查，全额支付"},
                {"label": "期后部分支付，差额为年终奖（分批）",
                 "value": "部分支付",
                 "note": "年终奖分Q1/Q2支付，正常，余额合理"},
                {"label": "期后支付与余额不符，需进一步调查",
                 "value": "差异需调查",
                 "note": "支付金额与余额不符，差异原因需跟进"},
            ],
        ),
    ]

    return FillResult(
        paper_index="B9",
        sheet_data=sheet_data,
        decisions=decisions,
        fill_summary=(
            f"AI已完成应付职工薪酬底稿草稿。余额¥{balance:,.0f}，"
            f"{employees}人，人均月薪约¥{per_person_est:,.0f}。"
            "需人工：①核查12月工资表并匹配余额 ②验证期后支付（完整性）。"
        ),
    )


def resume_B9(sheet_data: dict, decisions: dict) -> dict:
    sd = copy.deepcopy(sheet_data)
    payroll = decisions.get("B9-payroll-reasonableness", "匹配")
    post    = decisions.get("B9-post-payment", "已支付")

    sd["conclusion"]["analytical_result"] = {
        "匹配":       "12月工资表已核查，余额¥1,456,789与工资表合计匹配，员工人数无异常。",
        "差异已记录": "工资表核查存在差异，差异原因已记录在底稿，差异在TE以内，无需调整。",
        "替代程序":   "工资表未取得，已以社保记录和期后发薪银行记录作为替代程序。",
    }.get(payroll, payroll)

    sd["conclusion"]["post_payment_verified"] = {
        "已支付":    "2025年1月银行发薪记录已核查，12月薪酬全额支付，完整性确认。",
        "部分支付":  "年终奖分批支付（Q1/Q2），期末余额含年终奖计提，处理合理。",
        "差异需调查": "支付金额与账面余额不符，差异原因需进一步调查，暂列入待解决事项。",
    }.get(post, post)

    sd["conclusion"]["audit_result"] = (
        "通过" if payroll in ("匹配",) and post in ("已支付", "部分支付") else "待解决"
    )
    return sd


# ─── D1 主营业务收入 ─────────────────────────────────────────────────

def fill_D1() -> FillResult:
    revenue     = abs(next(r["balance"] for r in TB if r["code"] == "6001"))  # 45,678,901
    other_rev   = abs(next(r["balance"] for r in TB if r["code"] == "6051"))  # 456,789
    cost        = next(r["balance"] for r in TB if r["code"] == "6401")       # 28,901,234
    gross_profit = revenue - cost
    gross_margin = gross_profit / revenue
    ar_balance   = 12_345_678
    dso          = round(ar_balance / revenue * 365)

    related_rev = sum(r["balance"] for r in AR_DETAIL if r["related"])   # 1,234,567

    sheet_data = {
        "summary": {
            "operating_revenue":    revenue,
            "other_revenue":        other_rev,
            "total_revenue":        revenue + other_rev,
            "cost_of_revenue":      cost,
            "gross_profit":         gross_profit,
            "gross_margin_pct":     f"{gross_margin * 100:.1f}%",
            "related_party_revenue": related_rev,
            "dso_days":             dso,
            "audit_objective":      "确认收入的完整性、准确性及截止性；重点关注收入确认时点和关联方收入公允性",
        },
        "analytical_procedures": {
            "current_year_revenue":  revenue,
            "gross_margin":          f"{gross_margin * 100:.1f}%",
            "industry_avg_margin":   "35%~50%（软件信息服务行业参考区间）",
            "margin_assessment":     "合理" if 0.35 <= gross_margin <= 0.55 else "偏离行业均值，需关注",
            "ar_balance":            ar_balance,
            "dso_days":              dso,
            "dso_assessment":        "偏高，需关注应收账款回收" if dso > 90 else "正常",
            "related_party_pct":     f"{related_rev / revenue * 100:.1f}%",
            "ai_finding":            (
                f"毛利率{gross_margin*100:.1f}%（行业参考35%-50%）；"
                f"DSO {dso}天（{'偏高，需关注收款' if dso>90 else '正常'}）；"
                f"关联方收入占比{related_rev/revenue*100:.1f}%。"
            ),
        },
        "customer_detail": {
            "rows": [
                {
                    "customer":        r["name"],
                    "ar_balance":      r["balance"],
                    "is_related":      "是" if r["related"] else "否",
                    "confirmation_status": "待函证（结合A6）",
                    "revenue_note":    "关联方，需核查定价公允性" if r["related"] else "",
                }
                for r in AR_DETAIL
            ]
        },
        "cutoff_testing": {
            "test_period":  "2024年12月最后5个工作日 + 2025年1月前5个工作日",
            "scope":        "软件项目交付验收单、开票日期、合同交付节点",
            "status":       "待执行",
            "ai_guidance":  "重点关注：12月末开票但服务尚未交付（高估风险）；服务已交付但次年开票（低估风险）",
        },
        "audit_procedures_plan": {
            "rows": [
                {"procedure": "分析性程序",   "scope": "全年收入及毛利率",
                 "status": "AI已完成",        "responsible": "AI",
                 "note": f"毛利率{gross_margin*100:.1f}%，DSO {dso}天，已识别关联方收入{related_rev/revenue*100:.1f}%"},
                {"procedure": "截止性测试",   "scope": "12月末前后各5个工作日",
                 "status": "待执行",          "responsible": "人工",
                 "note": "核查交付验收单与收入确认时点是否匹配；抽取跨期凭证"},
                {"procedure": "函证（结合A6）","scope": "前5大客户",
                 "status": "待执行",           "responsible": "人工",
                 "note": "向C001-C005函证应收账款余额（间接验证收入完整性）"},
                {"procedure": "关联方收入核查","scope": f"斑华科技¥{related_rev:,.0f}",
                 "status": "待执行",           "responsible": "人工",
                 "note": "取得独立合同+服务交付证明+与非关联方价格对比"},
                {"procedure": "合同收入分析", "scope": "重大合同",
                 "status": "待执行",           "responsible": "人工",
                 "note": "对重大合同（>TE）逐一核查收入确认条件是否满足"},
            ]
        },
        "conclusion": {
            "book_revenue":         revenue,
            "risk_assessment":      "高",
            "key_risk":             f"收入确认时点（软件交付节点）；关联方收入公允性（¥{related_rev:,.0f}）；DSO {dso}天偏高",
            "cutoff_result":        "【待截止性测试完成后填写】",
            "related_party_result": "【待关联方核查完成后填写】",
            "audit_result":         "【待填】",
        },
    }

    decisions = [
        FillDecision(
            key="D1-revenue-recognition-policy",
            paper_index="D1",
            cell_path="conclusion.cutoff_result",
            question="请确认公司收入确认政策：软件服务收入何时确认（合同节点/验收/交付）？",
            context=(
                f"AI从TB读取主营业务收入¥{revenue:,.0f}，毛利率{gross_margin*100:.1f}%。\n\n"
                "软件服务收入确认通常有以下方式：\n"
                "• **时点确认**：客户验收后一次性确认（适合固定价格软件交付项目）\n"
                "• **期间确认（履约进度）**：按项目完工进度逐步确认（适合长期合同）\n"
                "• **服务期间摊销**：SaaS/维保服务按合同期间平均摊销\n\n"
                "需取得：①公司收入确认会计政策 ②重大合同条款 ③已开具发票与收入账的对应关系"
            ),
            options=[
                {"label": "时点确认——客户验收单签署后确认（推荐核查）",
                 "value": "时点确认",
                 "note": "以验收单为确认依据，需核查12月末验收单的真实性和时点"},
                {"label": "履约进度法——按合同完工进度确认",
                 "value": "完工进度",
                 "note": "需核查进度测量方法（投入法/产出法）及期末估算的合理性"},
                {"label": "混合策略（项目交付+维保摊销）",
                 "value": "混合",
                 "note": "不同合同类型分别处理，需逐合同核查"},
            ],
        ),
        FillDecision(
            key="D1-cutoff-result",
            paper_index="D1",
            cell_path="conclusion.cutoff_result",
            question="请确认截止性测试结果：是否发现跨期收入错报？",
            context=(
                "AI已识别截止性测试要点：\n\n"
                f"• 测试期间：2024年12月最后5个工作日 + 2025年1月前5个工作日\n"
                f"• 主营业务收入¥{revenue:,.0f}，单笔金额超过TE的合同需全部覆盖\n\n"
                "请抽取并核查：\n"
                "① 12月开票但服务尚未交付的凭证（高估收入风险）\n"
                "② 12月已交付但未开票的合同（低估收入风险）\n"
                "③ 合同交付验收单日期与开票日期/入账日期的一致性"
            ),
            options=[
                {"label": "截止测试通过，无跨期错报",
                 "value": "通过",
                 "note": "抽查凭证均在正确期间入账，收入截止准确"},
                {"label": "发现跨期错报，金额未超过TE（已记录）",
                 "value": "跨期小额",
                 "note": "跨期金额在TE以内，列入未更正错报汇总表"},
                {"label": "发现重大跨期错报（超过TE），需调整",
                 "value": "需调整",
                 "note": "跨期金额超过TE，建议调整收入，列入Z6审计调整表"},
            ],
        ),
    ]

    return FillResult(
        paper_index="D1",
        sheet_data=sheet_data,
        decisions=decisions,
        fill_summary=(
            f"AI已完成主营业务收入底稿草稿。收入¥{revenue:,.0f}，毛利率{gross_margin*100:.1f}%，"
            f"DSO {dso}天，关联方收入占比{related_rev/revenue*100:.1f}%。"
            "需人工：①确认收入确认政策 ②执行截止性测试 ③核查关联方收入公允性。"
        ),
    )


def resume_D1(sheet_data: dict, decisions: dict) -> dict:
    sd = copy.deepcopy(sheet_data)
    policy = decisions.get("D1-revenue-recognition-policy", "时点确认")
    cutoff = decisions.get("D1-cutoff-result", "通过")

    sd["conclusion"]["recognition_policy"] = {
        "时点确认":  "收入确认政策：以客户验收单签署日作为收入确认时点。",
        "完工进度":  "收入确认政策：按合同完工进度（完工百分比法）逐步确认，期末进度已核查。",
        "混合":      "收入确认政策：交付型项目按验收时点，维保/SaaS按合同期间摊销，混合处理。",
    }.get(policy, policy)

    sd["conclusion"]["cutoff_result"] = {
        "通过":       "截止性测试通过：抽查12月末前后凭证，均在正确期间入账，无跨期错报。",
        "跨期小额":  "截止测试发现跨期金额，但未超过TE，已列入未更正错报汇总表。",
        "需调整":    "截止测试发现重大跨期错报，超过TE，已列入Z6审计调整表，需管理层调整。",
    }.get(cutoff, cutoff)

    sd["conclusion"]["audit_result"] = "通过" if cutoff in ("通过", "跨期小额") else "待调整"
    return sd


# ─── dispatch tables ─────────────────────────────────────────────────

FILL_FNS: dict = {
    "Y3": fill_Y3,
    "Y5": fill_Y5,
    "X1": fill_X1,
    "A1": fill_A1,
    "A6": fill_A6,
    "A9": fill_A9,
    "A10": fill_A10,
    "A24": fill_A24,
    "B1": fill_B1,
    "B9": fill_B9,
    "D1": fill_D1,
}

RESUME_FNS: dict = {
    "Y3":  resume_Y3,
    "Y5":  resume_Y5,
    "X1":  resume_X1,
    "A1":  resume_A1,
    "A6":  resume_A6,
    "A9":  resume_A9,
    "A10": resume_A10,
    "A24": resume_A24,
    "B1":  resume_B1,
    "B9":  resume_B9,
    "D1":  resume_D1,
}
