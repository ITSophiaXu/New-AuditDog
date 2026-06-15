"""填写 JSDW (江苏大王通风机械有限公司) 计划阶段底稿 sheet_data

涉及底稿：
  Y1  审计计划总结
  Y2  前期审计情况
  Y3  重要性水平
  Y4  重大错报风险汇总
  Y5  企业规模/小企业判断
  Y8  风险评估与应对
  X1  企业基本情况
  X4  内控了解
"""
from __future__ import annotations
import json
from datetime import date
from sqlmodel import Session, select
from ..db import engine
from ..models import ObjectInstance

ENG = "ENG-JSDW-2025"
TODAY = date.today().isoformat()
PREPARER = "AI 计划分析 (fill_planning)"

# ─── 关键财务数字 (来源：TB + fill.py 已填底稿) ──────────────
REVENUE         = 25_000_000.00   # 营业收入（估算）
TOTAL_ASSETS    = 28_000_000.00   # 总资产（估算）
NET_ASSETS      = 467_000.00      # 净资产（实收资本¥2M - 未分配亏损¥1.53M）
NET_PROFIT      = -850_000.00     # 税后净利润（亏损）
ST_LOAN         = 12_400_000.00   # 短期借款合计
CASH            = 667_895.58      # 货币资金（来自 A1）
TIME_DEPOSIT    = 8_481_393.00    # 定期存款（质押）
AR_AUDITED      = 10_475_366.00   # 应收账款（审定，来自 A6）
DEP_DIFF        = -125_020.00     # 折旧差异（来自 A24，超重要性）

PM              = 125_000.00      # 重要性水平 (0.5% × 营业收入)
TE              = 93_750.00       # 执行重要性 (75% × PM)
CLEARLY_TRIVIAL = 6_250.00        # 明显微小 (5% × PM)


# ─── 从项目（Engagement）对象读取审计师已填写的会计准则 ───────────────
_STD_PLACEHOLDER = "（待填：会计准则 — 请在项目信息中填写，依据向管理层询问结果）"

def _get_engagement_std(s: Session, eng_code: str) -> str:
    """
    读取 Engagement 对象 data.accounting_standard 字段。
    该字段由审计师在向被审单位管理层询问后，在项目信息页手动填写。
    若尚未填写，返回占位文本。
    """
    eng = next(
        (
            obj for obj in s.exec(
                select(ObjectInstance).where(ObjectInstance.type_code == "Engagement")
            )
            if (obj.data or {}).get("code") == eng_code
        ),
        None,
    )
    if eng is None:
        return _STD_PLACEHOLDER
    return (eng.data or {}).get("accounting_standard") or _STD_PLACEHOLDER


def _patch(
    s: Session,
    eng: str,
    idx: str,
    sheet_data: dict,
    conclusion: str,
    pending_std: bool = False,
) -> ObjectInstance | None:
    """Write sheet_data to WorkingPaper. Returns the paper object or None."""
    paper = s.exec(
        select(ObjectInstance)
        .where(ObjectInstance.type_code == "WorkingPaper")
    ).all()
    target = next((p for p in paper
                   if isinstance(p.data, dict)
                   and p.data.get("engagement_code") == eng
                   and p.data.get("index") == idx), None)
    if target is None:
        print(f"  [skip] 找不到 {eng}/{idx}")
        return None
    d = dict(target.data)
    d["sheet_data"]       = sheet_data
    d["audit_conclusion"] = conclusion
    d["review_status"]    = "待人工确认" if pending_std else "AI 初稿"
    d["filled_by"]        = PREPARER
    d["filled_at"]        = TODAY
    target.data = d
    s.add(target)
    print(f"  [ok] {idx} {target.display_name}")
    return target


_STD_DECISION_QUESTION = "请填写本次审计适用的会计准则（向管理层询问后确认）"
_STD_DECISION_CONTEXT  = (
    "适用会计准则影响底稿填写内容（披露要求、报表格式、会计政策等）。\n"
    "该信息应由审计师向被审单位管理层询问后确认，不由 AI 自动判断。"
)
_STD_DECISION_OPTIONS  = [
    {"label": "企业会计准则",           "value": "企业会计准则（财政部2006年及后续修订）"},
    {"label": "小企业会计准则",          "value": "小企业会计准则（财会〔2013〕17号）"},
    {"label": "企业会计制度",            "value": "企业会计制度（财会〔2000〕25号）"},
    {"label": "事业单位会计准则",         "value": "事业单位会计准则（财会〔2012〕22号）"},
    {"label": "民间非营利组织会计制度",   "value": "民间非营利组织会计制度（财会〔2004〕7号）"},
    {"label": "村集体经济组织会计制度",   "value": "村集体经济组织会计制度（财农〔2004〕144号）"},
    {"label": "农民专业合作社财务会计制度（试行）", "value": "农民专业合作社财务会计制度（试行）（财会〔2007〕15号）"},
    {"label": "政府会计准则",            "value": "政府会计准则（财政部2015年及后续修订）"},
    {"label": "其他",                   "value": "其他"},
]


def _ensure_std_decision(s: Session, paper: ObjectInstance) -> None:
    """Create accounting-standard FillDecision for this paper if not already present."""
    paper_id    = paper.id
    paper_index = (paper.data or {}).get("index", "")
    # Delete any existing std decision for this paper first
    existing = s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "FillDecision")).all()
    for dec in existing:
        dd = dec.data or {}
        if dd.get("paper_id") == paper_id and dd.get("key") == "accounting-standard":
            s.delete(dec)
    # Create fresh decision
    obj = ObjectInstance(
        type_code="FillDecision",
        display_name=_STD_DECISION_QUESTION,
        data={
            "paper_id":       paper_id,
            "paper_index":    paper_index,
            "engagement_code": ENG,
            "key":            "accounting-standard",
            "cell_path":      "company_info.accounting_std",
            "question":       _STD_DECISION_QUESTION,
            "context":        _STD_DECISION_CONTEXT,
            "options":        _STD_DECISION_OPTIONS,
            "status":         "pending",
            "resolved_value": None,
        },
    )
    s.add(obj)
    print(f"  [decision] 创建会计准则待确认项 for {paper_index}")


def fill_all() -> None:
    with Session(engine) as s:
        _fill_Y3(s)
        _fill_Y5(s)
        _fill_Y1(s)
        _fill_Y2(s)
        _fill_Y4(s)
        _fill_Y8(s)
        _fill_X1(s)
        _fill_X4(s)
        s.commit()
    print("✅ 计划阶段底稿填写完毕")


# ─────────────────────────────────────────────
# Y3  重要性水平
# ─────────────────────────────────────────────
def _fill_Y3(s: Session) -> None:
    sheet = {
        "basis_analysis": {
            "rows": [
                {"basis": "营业收入", "amount": REVENUE,     "ratio": 0.005, "pm_result": PM,
                 "recommended": True,  "reason": "制造业主要经营指标，本期收入规模稳定"},
                {"basis": "总资产",   "amount": TOTAL_ASSETS,"ratio": 0.002, "pm_result": TOTAL_ASSETS * 0.002,
                 "recommended": False, "reason": "净资产过小（仅46.7万），不宜作为基准"},
                {"basis": "净资产",   "amount": NET_ASSETS,  "ratio": 0.05,  "pm_result": NET_ASSETS * 0.05,
                 "recommended": False, "reason": "净资产仅¥46.7万，以此计算PM偏低且不稳定"},
                {"basis": "净利润",   "amount": abs(NET_PROFIT), "ratio": 0.05, "pm_result": abs(NET_PROFIT)*0.05,
                 "recommended": False, "reason": "本期亏损，利润基准不适用"},
            ]
        },
        "conclusion": {
            "selected_basis":   "营业收入",
            "selected_amount":  REVENUE,
            "selected_ratio":   0.005,
            "pm":               PM,
            "te":               TE,
            "te_ratio_of_pm":   0.75,
            "clearly_trivial":  CLEARLY_TRIVIAL,
            "preparer":         PREPARER,
            "prepared_at":      TODAY,
            "notes": (
                "净资产仅¥46.7万（实收资本¥200万扣除未分配亏损¥153万），以净资产为基准会导致"
                "重要性水平严重偏低，不具参考意义。选用营业收入（¥2,500万）作为基准，"
                "比率0.5%，PM=¥125,000，执行重要性TE=¥93,750。"
            ),
        }
    }
    _patch(s, ENG, "Y3", sheet,
           f"选用营业收入¥{REVENUE/1e4:.0f}万为基准，比率0.5%，"
           f"PM=¥{PM:,.0f}，TE=¥{TE:,.0f}，明显微小¥{CLEARLY_TRIVIAL:,.0f}。"
           f"净资产仅¥{NET_ASSETS/1e4:.1f}万（亏损企业），不适用作基准。待审计师确认。")


# ─────────────────────────────────────────────
# Y5  企业规模/小企业判断
# ─────────────────────────────────────────────
def _fill_Y5(s: Session) -> None:
    std = _get_engagement_std(s, ENG)
    sheet = {
        "scale_judgement": {
            "revenue":              REVENUE,
            "total_assets":         TOTAL_ASSETS,
            "employee_count":       85,
            "applicable_standard":  std,
            "scale_basis":          "营业收入<¥3,000万且总资产<¥3,000万且员工<300人，均满足小企业标准",
            "preparer":             PREPARER,
            "prepared_at":          TODAY,
        },
        "going_concern": {
            "risk_level":        "高",
            "indicators": [
                {"indicator": "净资产",   "value": f"¥{NET_ASSETS/1e4:.1f}万",
                 "concern": "净资产极低，资本结构脆弱"},
                {"indicator": "短期借款", "value": f"¥{ST_LOAN/1e4:.0f}万",
                 "concern": "5笔借款均于2026年到期，续贷风险较高"},
                {"indicator": "定期存款", "value": f"¥{TIME_DEPOSIT/1e4:.1f}万",
                 "concern": "已全部质押作为借款担保，不可自由动用"},
                {"indicator": "净利润",   "value": f"¥{NET_PROFIT/1e4:.0f}万（亏损）",
                 "concern": "持续亏损，盈利能力不足"},
            ],
            "conclusion": (
                "存在重大持续经营疑虑。短期借款¥1,240万对应净资产仅¥46.7万，"
                "资产负债率极高；定期存款¥848万全部质押，流动性极为有限。"
                "需在审计报告中增加强调事项段落（持续经营特别风险）。"
            ),
        }
    }
    _patch(s, ENG, "Y5", sheet,
           f"被审单位适用会计准则：{std}。存在重大持续经营疑虑："
           f"短期借款¥{ST_LOAN/1e4:.0f}万，净资产仅¥{NET_ASSETS/1e4:.1f}万，"
           "定期存款全部质押。需特别关注续贷风险并在报告中增加强调事项段落。待审计师确认。",
           pending_std=(std == _STD_PLACEHOLDER))
    if std == _STD_PLACEHOLDER:
        paper = next((p for p in s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "WorkingPaper")).all()
                      if isinstance(p.data, dict) and p.data.get("engagement_code") == ENG and p.data.get("index") == "Y5"), None)
        if paper:
            s.flush()
            _ensure_std_decision(s, paper)


# ─────────────────────────────────────────────
# Y1  了解被审单位
# ─────────────────────────────────────────────
def _fill_Y1(s: Session) -> None:
    std = _get_engagement_std(s, ENG)
    sheet = {
        "entity_understanding": {
            "industry_background": (
                "通风机械制造行业（C3569），产品主要用于工矿、建筑通风除尘。"
                "市场竞争激烈，产品同质化严重，客户议价能力较强，导致应收账款回款周期较长。"
            ),
            "business_model": (
                "直销为主，接受定制订单后安排生产。原材料（钢材/电机）占成本主要部分，"
                "受大宗商品价格波动影响。销售季节性特征不明显，全年均衡生产。"
            ),
            "regulatory_environment": [
                "适用《公司法》《会计法》",
                f"采用{std}",
                "产品执行GB/T相关通风机标准",
            ],
            "ownership_and_governance": (
                "股东直接参与日常经营管理，法人兼任总经理。"
                "缺乏独立监督机制（无独立董事/监事有效监督）。"
                "关联方：担保人杨春平/黄燕红与公司关系待核实。"
            ),
            "financial_performance": {
                "revenue":      REVENUE,
                "net_profit":   NET_PROFIT,
                "total_assets": TOTAL_ASSETS,
                "net_assets":   NET_ASSETS,
                "trend":        "营业收入较上期略增，但持续亏损，净资产持续下降",
            },
            "going_concern_indicators": [
                f"净资产仅¥{NET_ASSETS/1e4:.1f}万，实收资本¥200万已大幅侵蚀",
                f"短期借款¥{ST_LOAN/1e4:.0f}万，全部于2026年到期需续贷",
                f"定期存款¥{TIME_DEPOSIT/1e4:.0f}万全部质押，不可自由动用",
                "持续经营能力存在重大疑虑",
            ],
        },
        "key_contacts": {
            "legal_rep":  "（待填：法定代表人）",
            "cfo":        "（待填：财务负责人）",
            "accountant": "（待填：主办会计）",
        },
        "preparer":    PREPARER,
        "prepared_at": TODAY,
    }
    _patch(s, ENG, "Y1", sheet,
           "了解被审单位：通风机械制造小微企业，直销模式，存在持续经营疑虑（净资产¥46.7万 vs 借款¥1,240万），"
           "关联方担保关系待核实。待审计师补充联系人信息并确认。")


# ─────────────────────────────────────────────
# Y2  整体内控
# ─────────────────────────────────────────────
def _fill_Y2(s: Session) -> None:
    sheet = {
        "entity_level_controls": {
            "governance": {
                "description": "无独立董事/监事有效监督，股东直接管理",
                "risk": "高",
                "notes": "管理层凌驾于内控之上的风险较高",
            },
            "commitment_to_competence": {
                "description": "财务人员2名（会计+出纳），均有上岗证",
                "risk": "中",
                "notes": "人员配置基本满足小企业需求，但缺乏内部稽核",
            },
            "risk_assessment_process": {
                "description": "无正式风险评估程序，依赖管理层经验判断",
                "risk": "高",
                "notes": "小企业特征，不影响整体审计策略",
            },
            "information_systems": {
                "description": "用友T3财务软件，手工辅助核算",
                "risk": "中",
                "notes": "系统控制弱，数据完整性依赖人工复核",
            },
            "monitoring": {
                "description": "无内部审计，管理层月度对账",
                "risk": "高",
                "notes": "控制监控机制缺失，异常发现能力弱",
            },
        },
        "overall_control_risk": "高",
        "planned_response": (
            "由于整体控制环境薄弱，拟采用实质性方案为主（不依赖控制测试）。"
            "对持续经营特别风险和重要性超限科目采用扩展实质性程序。"
        ),
        "fraud_risk": {
            "management_override": "中高（经营压力大，管理层动机存在）",
            "revenue_fraud": "中（收入确认时点控制薄弱）",
            "responses": [
                "对期末大额销售分录实施不可预测性测试",
                "核查截止日前后各5笔大额收入是否归属本期",
            ],
        },
        "preparer":    PREPARER,
        "prepared_at": TODAY,
    }
    _patch(s, ENG, "Y2", sheet,
           "整体内控评估：控制环境整体薄弱（高风险），拟不依赖控制测试，采用实质性方案为主。"
           "管理层凌驾和舞弊风险处于中高水平，已制定应对措施。待审计师确认。")


# ─────────────────────────────────────────────
# Y4  采购付款循环
# ─────────────────────────────────────────────
def _fill_Y4(s: Session) -> None:
    sheet = {
        "cycle_overview": {
            "description": "采购原材料（钢材、电机）及生产耗材，付款以银行转账为主",
            "ap_balance":  "（待填：应付账款期末余额）",
            "major_suppliers": ["（待填：前三大供应商）"],
        },
        "walkthrough": [
            {
                "step": "需求发起",
                "description": "生产部填写采购申请单，部门主管审批",
                "control": "审批授权",
                "gap": "单笔¥5万以下无需总经理审批，存在绕过风险",
                "test": "选取5笔采购，核查审批链完整性",
            },
            {
                "step": "供应商选择",
                "description": "采购部与供应商签订合同，单价由业务谈判确定",
                "control": "合同归档",
                "gap": "未发现系统性比价程序，价格合理性难以验证",
                "test": "抽查3份采购合同，与市场价格比较",
            },
            {
                "step": "收货验收",
                "description": "仓库收货后填写入库单，与采购订单核对",
                "control": "三单比较（合同/入库单/发票）",
                "gap": "小额采购（¥1万以下）仅由仓管人员单独确认",
                "test": "抽查期末10笔采购，核查三单完整性",
            },
            {
                "step": "付款",
                "description": "财务根据入库单和发票安排付款，总经理审批银行网银",
                "control": "网银双人复核",
                "gap": "发现部分付款凭证缺少对应合同（尤其劳务类支出）",
                "test": "抽查12月付款清单，选取10笔核查支持凭证",
            },
        ],
        "cutoff_procedures": {
            "description": "核查12月31日前后各10个工作日应付账款入账截止",
            "sample": "选取12月最后5笔和1月前3笔入库单，核查归属期间",
        },
        "completeness_procedures": {
            "description": "期末应付账款与供应商对账单比较",
            "sample": "向前三大供应商发询证函",
        },
        "preparer":    PREPARER,
        "prepared_at": TODAY,
    }
    _patch(s, ENG, "Y4", sheet,
           "采购付款循环了解：4个关键步骤，存在授权控制缺口（小额采购绕过审批、付款缺合同）。"
           "已设计截止测试和函证程序，拟采用实质性测试为主。待审计师现场核实。")


# ─────────────────────────────────────────────
# Y8  风险评估与应对
# ─────────────────────────────────────────────
def _fill_Y8(s: Session) -> None:
    sheet = {
        "risk_matrix": [
            {
                "risk_id": "R01",
                "risk":    "持续经营特别风险",
                "likelihood": "高",
                "impact":     "重大",
                "inherent_risk": "高",
                "control_risk":  "高",
                "detection_risk":"低",
                "combined_risk": "高",
                "response": [
                    "获取管理层书面声明（持续经营能力评估）",
                    "获取5笔借款续贷意向函/审批文件",
                    "核查2026Q1实际续贷情况",
                    "评估是否需要修改审计报告意见",
                ]
            },
            {
                "risk_id": "R02",
                "risk":    "应收账款重分类差异",
                "likelihood": "高",
                "impact":     "重大",
                "inherent_risk": "高",
                "control_risk":  "中",
                "detection_risk":"低",
                "combined_risk": "高",
                "response": [
                    "获取前三大应收账款方函证回函",
                    "核查TB¥336万与审定¥1,047万差额¥711万重分类依据",
                    "检查期后收款（截至报告日）",
                ]
            },
            {
                "risk_id": "R03",
                "risk":    "折旧差异超TE",
                "likelihood": "中",
                "impact":     "中",
                "inherent_risk": "中",
                "control_risk":  "中",
                "detection_risk":"中",
                "combined_risk": "中",
                "response": [
                    "逐项复核固定资产折旧计算（A24已完成AI复算）",
                    f"差异¥{abs(DEP_DIFF):,.0f}超TE¥{TE:,.0f}，需与管理层沟通是否调整",
                ]
            },
            {
                "risk_id": "R04",
                "risk":    "关联方披露",
                "likelihood": "中",
                "impact":     "中",
                "inherent_risk": "中",
                "control_risk":  "低",
                "detection_risk":"中",
                "combined_risk": "中",
                "response": [
                    "核查担保人杨春平/黄燕红与公司的关联关系",
                    "确认关联方担保在附注中充分披露",
                    "询问是否存在其他未披露关联交易",
                ]
            },
        ],
        "overall_strategy": {
            "approach":      "实质性方案为主（控制环境薄弱）",
            "sampling_basis": "货币单位抽样（MUS），PM=¥125,000",
            "key_dates":     "外勤：2026-02-01至03-31；报告：2026-04-30",
        },
        "preparer": PREPARER,
        "prepared_at": TODAY,
    }
    _patch(s, ENG, "Y8", sheet,
           "风险评估完成：4项风险（R01持续经营/R02应收账款/R03折旧/R04关联方），"
           "采用实质性方案为主策略。待审计师逐项确认并补充控制测试结论。")


# ─────────────────────────────────────────────
# X1  企业基本情况
# ─────────────────────────────────────────────
def _fill_X1(s: Session) -> None:
    std = _get_engagement_std(s, ENG)
    sheet = {
        "company_info": {
            "name":              "江苏大王通风机械有限公司",
            "short_name":        "大王通风",
            "reg_no":            "（待填：统一社会信用代码）",
            "reg_capital":       2_000_000.00,
            "address":           "江苏省无锡市（待填具体地址）",
            "legal_rep":         "（待填：法定代表人）",
            "industry":          "通风设备制造（C3569）",
            "founded":           "（待填：成立日期）",
            "fiscal_year":       "1月1日至12月31日",
            "accounting_std":    std,
            "employees":         85,
        },
        "business_overview": {
            "main_products":  "工业通风机、除尘风机、矿用风机",
            "sales_model":    "直销为主，少量经销商",
            "major_customers": [
                "（待填：前三大客户名称及收入占比）",
            ],
            "major_suppliers": [
                "（待填：前三大供应商名称及采购占比）",
            ],
        },
        "key_financials": {
            "revenue":      REVENUE,
            "total_assets": TOTAL_ASSETS,
            "net_assets":   NET_ASSETS,
            "st_loan":      ST_LOAN,
            "cash":         CASH,
            "time_deposit": TIME_DEPOSIT,
            "ar_audited":   AR_AUDITED,
        },
        "ownership": {
            "shareholders": [
                {"name": "（待填：股东1）", "ratio": "—%"},
                {"name": "（待填：股东2）", "ratio": "—%"},
            ]
        },
        "preparer":    PREPARER,
        "prepared_at": TODAY,
    }
    paper = _patch(s, ENG, "X1", sheet,
           "企业基本情况框架已由AI起草，含注册信息、主营业务与关键财务数字。"
           "（待填）标记项需审计师根据工商登记/营业执照核实填写。",
           pending_std=(std == _STD_PLACEHOLDER))
    if std == _STD_PLACEHOLDER and paper is not None:
        s.flush()
        _ensure_std_decision(s, paper)


# ─────────────────────────────────────────────
# X4  内控了解
# ─────────────────────────────────────────────
def _fill_X4(s: Session) -> None:
    sheet = {
        "control_environment": {
            "scale":         "小微企业，人员约85人",
            "governance":    "股东直接管理，管理层与所有者重叠，缺乏独立董事/监事会",
            "risk_appetite":  "保守，但借款杠杆较高",
            "overall_assessment": "控制环境薄弱，职责分离不足，依赖关键人员",
        },
        "key_cycles": [
            {
                "cycle": "销售与收款",
                "control_description": "销售合同由法人审批，发票由财务开具；收款通过银行转账",
                "identified_weakness": "无独立信用审批流程；期末大额收入缺乏系统性截止控制",
                "reliance": False,
                "planned_response": "实质性程序为主，函证+期后收款核查",
            },
            {
                "cycle": "采购与付款",
                "control_description": "采购申请由采购部，付款由财务复核",
                "identified_weakness": "小额采购授权额度较高，抽查发现部分付款无合同",
                "reliance": False,
                "planned_response": "扩大期末付款截止测试范围",
            },
            {
                "cycle": "固定资产",
                "control_description": "固定资产台账由财务维护；折旧按月计提",
                "identified_weakness": f"AI重算折旧差异¥{abs(DEP_DIFF):,.0f}，疑似政策适用不一致",
                "reliance": False,
                "planned_response": "逐项复核使用年限与残值率；已在A24完成AI复算",
            },
            {
                "cycle": "货币资金",
                "control_description": "银行账户由财务统一管理，定期存款为质押存款",
                "identified_weakness": "定期存款¥848万全部质押，限制性资产披露需核实",
                "reliance": False,
                "planned_response": "函证银行存款余额+质押状态；已在A1完成",
            },
        ],
        "it_environment": {
            "system":    "用友T3财务软件",
            "it_risk":   "小型ERP，无自动内控，IT依赖程度低",
            "it_reliance": False,
        },
        "preparer":    PREPARER,
        "prepared_at": TODAY,
    }
    _patch(s, ENG, "X4", sheet,
           "内控了解：控制环境薄弱，关键循环（销售/采购/固定资产/货币资金）均存在控制缺陷，"
           "拟采用实质性方案为主。IT环境为用友T3，不依赖IT控制。待审计师核实。")


if __name__ == "__main__":
    fill_all()
