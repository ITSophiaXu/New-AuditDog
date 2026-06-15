"""Seed the audit ontology: object types, link types, action types, plus a sample
engagement with TB / vouchers / an empty 货币资金 working paper, plus the fill agent
and three stubbed scenario agents."""
from __future__ import annotations

from sqlmodel import Session, select

from .db import engine
from .models import (
    ObjectType, LinkType, ActionType,
    ObjectInstance, LinkInstance,
    AgentConfig, MCPServer,
)
from .provenance import (
    make_provenance,
    provenance_for_rule,
    provenance_for_template,
)


# ---------- Type seeds ----------

OBJECT_TYPES = [
    {
        "code": "Engagement", "display_name": "审计项目", "icon": "Briefcase", "color": "#6366f1",
        "description": "一次年度财务审计的承接项目",
        "properties_schema": [
            {"code": "code", "label": "项目编号", "type": "string", "required": True},
            {"code": "client_name", "label": "客户名称", "type": "string", "required": True},
            {"code": "period", "label": "审计期间", "type": "string"},
            {"code": "partner", "label": "签字合伙人", "type": "string"},
            {"code": "status", "label": "状态", "type": "enum", "enum": ["规划中", "外勤中", "复核中", "已完成"]},
        ],
    },
    {
        "code": "Client", "display_name": "被审客户", "icon": "Building2", "color": "#0ea5e9",
        "description": "被审计的企业实体",
        "properties_schema": [
            {"code": "name", "label": "公司名称", "type": "string", "required": True},
            {"code": "industry", "label": "行业", "type": "string"},
            {"code": "scale", "label": "规模", "type": "enum", "enum": ["大型", "中型", "小微"]},
            {"code": "fiscal_year", "label": "会计年度", "type": "string"},
        ],
    },
    {
        "code": "TrialBalance", "display_name": "试算平衡表", "icon": "Table2", "color": "#0d9488",
        "description": "按期间汇总的科目余额",
        "properties_schema": [
            {"code": "period", "label": "期间", "type": "string", "required": True},
            {"code": "currency", "label": "币种", "type": "string"},
            {"code": "rows", "label": "科目行", "type": "json"},
        ],
    },
    {
        "code": "Account", "display_name": "科目", "icon": "Hash", "color": "#475569",
        "description": "会计科目",
        "properties_schema": [
            {"code": "code", "label": "科目编号", "type": "string", "required": True},
            {"code": "name", "label": "科目名称", "type": "string", "required": True},
            {"code": "type", "label": "科目类别", "type": "enum", "enum": ["资产", "负债", "权益", "收入", "费用"]},
            {"code": "balance", "label": "余额", "type": "money"},
        ],
    },
    {
        "code": "Voucher", "display_name": "凭证", "icon": "FileText", "color": "#a16207",
        "description": "会计凭证",
        "properties_schema": [
            {"code": "no", "label": "凭证号", "type": "string", "required": True},
            {"code": "date", "label": "日期", "type": "date"},
            {"code": "summary", "label": "摘要", "type": "string"},
            {"code": "entries", "label": "分录", "type": "json"},
        ],
    },
    {
        "code": "WorkingPaper", "display_name": "底稿", "icon": "ClipboardList", "color": "#9333ea",
        "description": "审计底稿，按模板结构填写",
        "properties_schema": [
            {"code": "code", "label": "底稿编号", "type": "string", "required": True},
            {"code": "name", "label": "底稿名称", "type": "string", "required": True},
            {"code": "template_code", "label": "所用模板", "type": "string"},
            {"code": "engagement_code", "label": "所属项目", "type": "string"},
            {"code": "status", "label": "状态", "type": "enum", "enum": ["未开始", "AI 初稿", "复核中", "已完成"]},
            {"code": "book_balance", "label": "账面余额", "type": "money"},
            {"code": "bank_confirmation_balance", "label": "银行询证函余额", "type": "money"},
            {"code": "cash_count_balance", "label": "库存现金盘点余额", "type": "money"},
            {"code": "currency", "label": "币种", "type": "string"},
            {"code": "audit_conclusion", "label": "审计结论", "type": "text"},
        ],
    },
    {
        "code": "PaperTemplate", "display_name": "底稿模板", "icon": "LayoutTemplate", "color": "#ec4899",
        "description": "可重用的底稿结构与默认规则",
        "properties_schema": [
            {"code": "code", "label": "模板编号", "type": "string", "required": True},
            {"code": "name", "label": "模板名称", "type": "string", "required": True},
            {"code": "scenario", "label": "适用场景", "type": "enum",
             "enum": ["底稿填写", "方案生成", "异常分析", "专项审计"]},
            {"code": "fields", "label": "字段清单", "type": "json"},
            {"code": "default_rules", "label": "默认规则", "type": "json"},
        ],
    },
    {
        "code": "AuditRule", "display_name": "审计规则", "icon": "Scale", "color": "#dc2626",
        "description": "可执行的审计校验规则",
        "properties_schema": [
            {"code": "code", "label": "规则编号", "type": "string", "required": True},
            {"code": "name", "label": "规则名称", "type": "string", "required": True},
            {"code": "category", "label": "类别", "type": "string"},
            {"code": "expression", "label": "表达式 / 说明", "type": "text"},
            {"code": "severity", "label": "严重程度", "type": "enum", "enum": ["low", "medium", "high"]},
        ],
    },
    {
        "code": "AuditProcedure", "display_name": "审计程序", "icon": "ListChecks", "color": "#14b8a6",
        "description": "底稿内的审计程序步骤",
        "properties_schema": [
            {"code": "step_no", "label": "步骤编号", "type": "string"},
            {"code": "description", "label": "程序内容", "type": "text"},
            {"code": "expected_evidence", "label": "预期证据", "type": "string"},
        ],
    },
    {
        "code": "Evidence", "display_name": "审计证据", "icon": "Paperclip", "color": "#64748b",
        "description": "支持底稿结论的证据材料",
        "properties_schema": [
            {"code": "type", "label": "证据类型", "type": "string"},
            {"code": "file_ref", "label": "文件引用", "type": "string"},
            {"code": "source", "label": "来源", "type": "string"},
            {"code": "captured_at", "label": "采集时间", "type": "date"},
        ],
    },
    {
        "code": "Anomaly", "display_name": "异常", "icon": "AlertTriangle", "color": "#f97316",
        "description": "审计规则或人工审阅识别的异常",
        "properties_schema": [
            {"code": "rule_code", "label": "触发规则", "type": "string"},
            {"code": "paper_id", "label": "底稿 ID", "type": "number"},
            {"code": "detail", "label": "异常描述", "type": "text"},
            {"code": "severity", "label": "严重程度", "type": "enum", "enum": ["low", "medium", "high"]},
            {"code": "status", "label": "状态", "type": "enum", "enum": ["open", "resolved", "ignored"]},
        ],
    },
    {
        "code": "SpecialAuditCase", "display_name": "专项审计案例", "icon": "Target", "color": "#dc2626",
        "description": "一次专项审计的端到端案例：背景、方案、程序、风险、结论",
        "properties_schema": [
            {"code": "case_no", "label": "案例编号", "type": "string", "required": True},
            {"code": "client_name", "label": "客户", "type": "string"},
            {"code": "special_type", "label": "专项类型", "type": "enum",
             "enum": [
                 "财务报表审计", "经济责任审计", "基本建设项目竣工决算审计",
                 "国企内控有效性评价", "财政专项资金审计", "行政事业单位预算执行审计",
                 "政府购买服务审计", "社会组织与公益慈善审计", "清产核资审计",
                 "破产清算/重整审计", "股东权益与净资产审计", "高新技术企业认定审计",
                 "研发费用加计扣除审计", "税务合规审计", "司法会计鉴定",
                 "反舞弊与内部举报审计", "其他专项审计",
             ]},
            {"code": "trigger", "label": "触发原因", "type": "enum",
             "enum": ["监管检查", "举报", "例行", "重大事项", "上级委托"]},
            {"code": "focus_points", "label": "关键关注点", "type": "text"},
            {"code": "period", "label": "审计期间", "type": "string"},
            {"code": "team_size", "label": "团队规模", "type": "number"},
            {"code": "status", "label": "状态", "type": "enum", "enum": ["规划中", "起草中", "外勤中", "复核中", "已完成"]},
            {"code": "plan_sections", "label": "方案结构", "type": "json"},
            {"code": "conclusion", "label": "审计结论", "type": "text"},
        ],
    },
]


LINK_TYPES = [
    ("EngagementHasClient", "项目 → 客户", "Engagement", "Client", "one"),
    ("EngagementHasPaper", "项目 → 底稿", "Engagement", "WorkingPaper", "many"),
    ("PaperUsesTemplate", "底稿 → 模板", "WorkingPaper", "PaperTemplate", "one"),
    ("PaperAppliesRule", "底稿 → 审计规则", "WorkingPaper", "AuditRule", "many"),
    ("PaperHasEvidence", "底稿 → 证据", "WorkingPaper", "Evidence", "many"),
    ("PaperHasProcedure", "底稿 → 审计程序", "WorkingPaper", "AuditProcedure", "many"),
    ("AccountInTrialBalance", "科目 ∈ 试算平衡表", "Account", "TrialBalance", "many"),
    ("VoucherTouchesAccount", "凭证 → 科目", "Voucher", "Account", "many"),
    ("AnomalyOnPaper", "异常 → 底稿", "Anomaly", "WorkingPaper", "one"),
    ("CaseForClient", "专项案例 → 客户", "SpecialAuditCase", "Client", "one"),
    ("CaseHasProcedure", "专项案例 → 程序", "SpecialAuditCase", "AuditProcedure", "many"),
    ("CaseAppliesRule", "专项案例 → 适用规则", "SpecialAuditCase", "AuditRule", "many"),
]


ACTION_TYPES = [
    {
        "code": "FillWorkingPaper", "display_name": "填写底稿",
        "description": "将一组字段写入底稿对象，原子提交。",
        "target_type_code": "WorkingPaper", "kind": "fill",
        "parameters_schema": [
            {"code": "fields", "label": "字段值", "type": "json", "required": True},
        ],
    },
    {
        "code": "FlagAnomaly", "display_name": "标记异常",
        "description": "创建一个异常对象并关联到底稿。",
        "target_type_code": "WorkingPaper", "kind": "flag",
        "parameters_schema": [
            {"code": "rule_code", "label": "触发规则", "type": "string"},
            {"code": "detail", "label": "描述", "type": "text", "required": True},
            {"code": "severity", "label": "严重程度", "type": "enum", "enum": ["low", "medium", "high"]},
        ],
    },
    {
        "code": "ApplyRule", "display_name": "应用规则",
        "description": "执行一条审计规则，可能产生异常。",
        "target_type_code": "WorkingPaper", "kind": "apply_rule",
        "parameters_schema": [
            {"code": "rule_code", "label": "规则编号", "type": "string", "required": True},
        ],
    },
    {
        "code": "AttachEvidence", "display_name": "附加证据",
        "description": "为底稿附加一份证据。",
        "target_type_code": "WorkingPaper", "kind": "attach",
        "parameters_schema": [
            {"code": "type", "label": "证据类型", "type": "string"},
            {"code": "file_ref", "label": "文件引用", "type": "string"},
        ],
    },
    {
        "code": "FillSheet", "display_name": "填写底稿子表",
        "description": "将一组单元格 / 行写入底稿的某个 sheet（主表 / 银行明细 / 现金盘点 等）。原子提交。",
        "target_type_code": "WorkingPaper", "kind": "fill_sheet",
        "parameters_schema": [
            {"code": "sheet_code", "label": "子表代码", "type": "string", "required": True,
             "help": "PaperTemplate.sheets[].code — 如 summary / bank_detail / cash_count / cutoff_test"},
            {"code": "content", "label": "内容", "type": "json", "required": True,
             "help": "对 summary 类 sheet 是 {field_code: value}；对 table 类是 {rows: [...]}"},
        ],
    },
    {
        "code": "DraftAuditPlan", "display_name": "起草专项审计方案",
        "description": "为专项案例起草完整方案，包含总体目标、重要性、抽样、KAM、风险、程序步骤。原子提交。",
        "target_type_code": "SpecialAuditCase", "kind": "fill",
        "parameters_schema": [
            {"code": "plan_sections", "label": "方案结构", "type": "json", "required": True,
             "help": "{objectives, materiality, sampling, kams[], risks[], procedures[], milestones[]}"},
        ],
    },
]


# ---------- Sample data ----------

def _has_object_with_code(s: Session, type_code: str, code: str) -> bool:
    objs = s.exec(select(ObjectInstance).where(ObjectInstance.type_code == type_code)).all()
    return any((o.data or {}).get("code") == code for o in objs)


def _ensure_object(s: Session, type_code: str, code: str, display_name: str, data: dict) -> ObjectInstance | None:
    if _has_object_with_code(s, type_code, code):
        return None
    obj = ObjectInstance(type_code=type_code, display_name=display_name, data=data)
    s.add(obj); s.commit(); s.refresh(obj)
    return obj


# Public + firm-internal rules across categories, including 政府专项审计.
EXTRA_RULES = [
    # ---- 公共法规 / 准则（来自中注协 / 财政部 / CSRC 等）----
    {"code": "REV-RULE-001", "name": "收入截止性核查 — 资产负债表日前后 5 个工作日凭证扫描",
     "category": "收入", "expression": "扫描期末前后凭证 / 出库单，比对发票与签收单日期",
     "severity": "high", "source": "公共", "issuer": "中注协", "effective": "2023-12"},
    {"code": "RPT-RULE-001", "name": "关联方交易关联关系完整性",
     "category": "关联交易", "expression": "管理层声明 + 工商穿透 + 银行流水比对",
     "severity": "high", "source": "公共", "issuer": "中注协", "effective": "2024-01"},
    {"code": "RPT-RULE-002", "name": "关联交易公允性 — 同期类似交易价格基准",
     "category": "关联交易", "expression": "对比第三方同类交易毛利率波动 ≤ 5%",
     "severity": "medium", "source": "公共", "issuer": "CSRC", "effective": "2024-06"},
    # ---- 政府专项资金审计 专用 ----
    {"code": "GOV-RULE-001", "name": "专项资金专款专用",
     "category": "政府专项", "expression": "专项账户进出与立项批复用途逐笔比对，禁止挪用",
     "severity": "high", "source": "公共", "issuer": "财政部", "effective": "2023-09"},
    {"code": "GOV-RULE-002", "name": "政府采购合规性 — 限额以上须公开招标",
     "category": "政府专项", "expression": "单笔 ≥ 200,000 或合计 ≥ 1,000,000 须有公开招标记录与中标通知书",
     "severity": "high", "source": "公共", "issuer": "财政部", "effective": "2024-01"},
    {"code": "GOV-RULE-003", "name": "项目绩效目标完成度",
     "category": "政府专项", "expression": "比对立项绩效目标 vs. 项目结题报告，偏离 > 20% 须重点说明",
     "severity": "medium", "source": "公共", "issuer": "财政部", "effective": "2023-09"},
    {"code": "GOV-RULE-004", "name": "结余资金处理合规",
     "category": "政府专项", "expression": "节余资金须按办法上缴或形成结转，禁止转入经营性账户",
     "severity": "high", "source": "公共", "issuer": "财政部", "effective": "2024-01"},
    # ---- 事务所自有 ----
    {"code": "FIRM-RULE-001", "name": "事务所复核 — 三级复核单签字完整性",
     "category": "复核标准", "expression": "项目经理 / 部门经理 / 合伙人三级签字齐备",
     "severity": "medium", "source": "事务所", "issuer": "本所", "effective": "2025-01"},
    {"code": "FIRM-RULE-002", "name": "事务所内规 — 重大异常须立即上报合伙人",
     "category": "复核标准", "expression": "severity == 'high' 触发 24h 内合伙人接收",
     "severity": "high", "source": "事务所", "issuer": "本所", "effective": "2025-01"},
]


def _seed_extra_rules(s: Session) -> None:
    for r in EXTRA_RULES:
        r = {**r, "provenance": provenance_for_rule(r["code"])}
        _ensure_object(s, "AuditRule", r["code"], r["name"], r)


# A few extra paper templates so 模板 tab has variety.
EXTRA_TEMPLATES = [
    {
        "code": "TPL-AR-01", "name": "应收账款底稿模板", "scenario": "底稿填写",
        "fields": [
            {"code": "book_balance", "label": "账面余额", "type": "money", "required": True},
            {"code": "confirmation_balance", "label": "函证回函余额", "type": "money"},
            {"code": "aging_summary", "label": "账龄分布", "type": "json"},
            {"code": "bad_debt_provision", "label": "坏账准备", "type": "money"},
            {"code": "audit_conclusion", "label": "审计结论", "type": "text"},
        ],
        "default_rules": ["REV-RULE-001", "FIRM-RULE-001"],
    },
    {
        "code": "TPL-REV-01", "name": "营业收入底稿模板", "scenario": "底稿填写",
        "fields": [
            {"code": "total_revenue", "label": "营业收入总额", "type": "money", "required": True},
            {"code": "main_revenue", "label": "主营业务收入", "type": "money"},
            {"code": "other_revenue", "label": "其他业务收入", "type": "money"},
            {"code": "cutoff_test", "label": "截止性测试", "type": "text"},
            {"code": "audit_conclusion", "label": "审计结论", "type": "text"},
        ],
        "default_rules": ["REV-RULE-001", "RPT-RULE-002"],
    },
    {
        "code": "TPL-GOV-PLAN-01", "name": "政府专项审计方案模板", "scenario": "专项审计",
        "fields": [
            {"code": "objectives", "label": "总体目标", "type": "text"},
            {"code": "materiality", "label": "重要性水平", "type": "money"},
            {"code": "sampling", "label": "抽样方案", "type": "text"},
            {"code": "kams", "label": "关键审计事项", "type": "json"},
            {"code": "risks", "label": "关键风险点", "type": "json"},
        ],
        "default_rules": ["GOV-RULE-001", "GOV-RULE-002", "GOV-RULE-003", "GOV-RULE-004"],
    },
]


def _seed_extra_templates(s: Session) -> None:
    for t in EXTRA_TEMPLATES:
        t = {**t, "provenance": provenance_for_template(t["code"])}
        _ensure_object(s, "PaperTemplate", t["code"], t["name"], t)


# Historical 专项 cases for 案例库 — purely retrospective, status=已完成.
HISTORY_CASES = [
    {
        "case_no": "SPC-2024-009",
        "client_name": "海岸建工集团有限公司",
        "special_type": "政府专项资金审计",
        "trigger": "上级委托",
        "focus_points": "市新基建专项资金使用合规性；招投标程序；结余资金处理。",
        "period": "2023-01 至 2023-12",
        "team_size": 5,
        "status": "已完成",
        "conclusion": "整体符合专项资金管理办法，识别 2 项中等风险（一项招标资料不全，一项结余处理待整改），出具保留意见的专项审计报告。",
        "plan_sections": {
            "objectives": "对市新基建专项资金 1.2 亿元的拨付、使用、结余进行合规性与绩效审计。",
            "materiality": 600000,
            "sampling": "重要单笔 ≥ 200,000 全选；其余按 PPS 抽样 30 笔。",
            "kams": ["专项资金挪用风险", "政府采购程序合规性", "项目绩效目标偏离"],
            "procedures_count": 14,
            "risks": ["招标资料缺失 — 中等", "工程款滞留 — 低"],
        },
    },
    {
        "case_no": "SPC-2024-014",
        "client_name": "蓝海科技股份有限公司",
        "special_type": "其他专项审计",
        "trigger": "监管检查",
        "focus_points": "实控人体外循环嫌疑；同期同类交易价格公允性。",
        "period": "2023-01 至 2024-06",
        "team_size": 4,
        "status": "已完成",
        "conclusion": "未发现实控人体外循环证据；2 笔关联销售毛利率显著高于第三方，已要求披露。",
        "plan_sections": {
            "objectives": "核查关联方完整性、关联交易公允性与披露完整性。",
            "materiality": 2200000,
            "sampling": "全部关联方与交易全选；非关联同类交易按金额前 20 笔抽查。",
            "kams": ["关联关系穿透", "公允性比对", "披露完整性"],
            "procedures_count": 11,
            "risks": ["毛利率显著偏离 — 中等"],
        },
    },
]


def _seed_history_cases(s: Session) -> None:
    for c in HISTORY_CASES:
        c = {**c, "provenance": make_provenance(
            origin="customer-derived",
            bundle="firm-cases@2024",
            version="1.0.0",
            issuer="本所归档",
            effective_from="2024-12-31",
            anonymized_from=f"{c['client_name']} 原始项目档案 (已脱敏)",
            author="历史归档",
            status="active",
        )}
        _ensure_object(s, "SpecialAuditCase", c["case_no"], f"{c['client_name']} · {c['special_type']}", c)


# Active demo case for the 专项审计 flagship walkthrough.
ACTIVE_CASE = {
    "case_no": "SPC-2025-031",
    "client_name": "云栖数智科技股份有限公司",
    "client_industry": "新一代信息技术",
    "special_type": "政府专项资金审计",
    "trigger": "上级委托",
    "focus_points": (
        "受市数字经济发展局委托，对「智慧城市新基建」专项资金 8,500 万元的拨付、使用、绩效进行专项审计。"
        "重点关注：(1) 政府采购程序合规性；(2) 工程类支出真实性与发票合规；"
        "(3) 服务外包关联方识别；(4) 项目结余资金是否按办法上缴。"
    ),
    "period": "2024-01 至 2024-12",
    "team_size": 4,
    "status": "规划中",
    "plan_sections": {},
    "conclusion": "",
    "grant_amount": 85000000,
}


def _seed_active_case(s: Session) -> None:
    """Seed the active 政府专项 case + a matching client (used by the 专项审计 workbench)."""
    # Ensure client exists
    if not any((c.data or {}).get("name") == ACTIVE_CASE["client_name"]
               for c in s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "Client")).all()):
        s.add(ObjectInstance(
            type_code="Client", display_name=ACTIVE_CASE["client_name"],
            data={
                "name": ACTIVE_CASE["client_name"],
                "industry": ACTIVE_CASE["client_industry"],
                "scale": "中型",
                "fiscal_year": "2024",
            },
        ))
        s.commit()

    case = {**ACTIVE_CASE, "provenance": make_provenance(
        origin="customer-derived",
        bundle=None,                       # active case is not yet harvested
        version="0.1.0",
        issuer="项目组",
        author="云栖项目组",
        status="draft",                    # draft until 三级复核 + 已完成
    )}
    _ensure_object(
        s, "SpecialAuditCase", case["case_no"],
        f"{case['client_name']} · {case['special_type']}",
        case,
    )


def _seed_sample_data(s: Session) -> None:
    if s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "Engagement")).first():
        return

    # Client
    client = ObjectInstance(
        type_code="Client", display_name="星河制造（杭州）有限公司",
        data={"name": "星河制造（杭州）有限公司", "industry": "高端装备制造",
              "scale": "中型", "fiscal_year": "2025"},
    )
    s.add(client); s.commit(); s.refresh(client)

    # Engagement
    eng = ObjectInstance(
        type_code="Engagement", display_name="星河制造 2025 年报",
        data={"code": "ENG-2025-018", "client_name": client.data["name"],
              "period": "2025-12-31", "partner": "王明远", "status": "外勤中"},
    )
    s.add(eng); s.commit(); s.refresh(eng)
    s.add(LinkInstance(link_type_code="EngagementHasClient", source_id=eng.id, target_id=client.id))

    # Trial Balance
    tb_rows = [
        {"account_code": "1001", "account_name": "银行存款", "balance": 1284593.27, "type": "资产"},
        {"account_code": "1002", "account_name": "库存现金", "balance": 8520.00, "type": "资产"},
        {"account_code": "1122", "account_name": "应收账款", "balance": 5621400.00, "type": "资产"},
        {"account_code": "1601", "account_name": "固定资产", "balance": 18420000.00, "type": "资产"},
        {"account_code": "2202", "account_name": "应付账款", "balance": 3215800.00, "type": "负债"},
        {"account_code": "6001", "account_name": "主营业务收入", "balance": 42180000.00, "type": "收入"},
    ]
    tb = ObjectInstance(
        type_code="TrialBalance", display_name="2025年12月试算平衡表",
        data={"period": "2025-12-31", "currency": "CNY", "rows": tb_rows},
    )
    s.add(tb); s.commit(); s.refresh(tb)

    # A couple of vouchers for 1001 银行存款
    vouchers_data = [
        {"no": "记-2025-1208", "date": "2025-12-08", "summary": "收到客户回款",
         "entries": [{"account_code": "1001", "debit": 320000.00, "credit": 0},
                     {"account_code": "1122", "debit": 0, "credit": 320000.00}]},
        {"no": "记-2025-1217", "date": "2025-12-17", "summary": "支付供应商货款",
         "entries": [{"account_code": "2202", "debit": 180000.00, "credit": 0},
                     {"account_code": "1001", "debit": 0, "credit": 180000.00}]},
    ]
    for vd in vouchers_data:
        v = ObjectInstance(type_code="Voucher", display_name=vd["no"], data=vd)
        s.add(v)
    s.commit()

    # Audit rules (货币资金类，作为公共法规默认订阅)
    rules = [
        {"code": "CASH-RULE-001", "name": "银行存款账面余额与银行询证函一致性",
         "category": "货币资金", "expression": "abs(book_balance - bank_confirmation_balance) < 0.01",
         "severity": "high", "source": "公共", "issuer": "中注协", "effective": "2023-12"},
        {"code": "CASH-RULE-002", "name": "大额现金收支凭证异常扫描",
         "category": "货币资金", "expression": "单笔 > 500,000 须有审批",
         "severity": "medium", "source": "公共", "issuer": "中注协", "effective": "2023-12"},
        {"code": "CASH-RULE-003", "name": "库存现金日盘点完整性",
         "category": "货币资金", "expression": "每月至少 1 次盘点表",
         "severity": "low", "source": "公共", "issuer": "中注协", "effective": "2023-12"},
    ]
    for r in rules:
        r = {**r, "provenance": provenance_for_rule(r["code"])}
        s.add(ObjectInstance(type_code="AuditRule", display_name=r["name"], data=r))
    s.commit()

    # Paper template — 货币资金（多 sheet 工作底稿，A1 系列）
    template = ObjectInstance(
        type_code="PaperTemplate", display_name="货币资金底稿模板 (A1)",
        data={
            "code": "TPL-CASH-01", "name": "货币资金底稿模板 (A1)", "scenario": "底稿填写",
            "default_rules": ["CASH-RULE-001", "CASH-RULE-002", "CASH-RULE-003"],
            "provenance": provenance_for_template("TPL-CASH-01"),
            "sheets": [
                {
                    "code": "summary",
                    "name": "A1-1 货币资金主表",
                    "kind": "summary",
                    "description": "项目级汇总，与试算平衡表余额核对。",
                    "fields": [
                        {"code": "bank_book_total", "label": "银行账面合计",
                         "type": "money", "computed": True,
                         "formula": "Σ bank_detail.book_balance"},
                        {"code": "bank_conf_total", "label": "银行询证函合计",
                         "type": "money", "computed": True,
                         "formula": "Σ bank_detail.confirmation_balance"},
                        {"code": "bank_diff", "label": "银行 账面-询证 差异",
                         "type": "money", "computed": True,
                         "formula": "bank_book_total - bank_conf_total"},
                        {"code": "cash_total", "label": "库存现金合计",
                         "type": "money", "computed": True,
                         "formula": "Σ cash_count.physical_amount"},
                        {"code": "book_balance_total", "label": "货币资金账面合计",
                         "type": "money", "computed": True,
                         "formula": "bank_book_total + cash_total"},
                        {"code": "tb_balance", "label": "试算平衡表余额 (1001+1002)",
                         "type": "money"},
                        {"code": "tb_diff", "label": "账面 vs TB 差异",
                         "type": "money", "computed": True,
                         "formula": "book_balance_total - tb_balance"},
                        {"code": "currency", "label": "币种", "type": "string", "default": "CNY"},
                        {"code": "audit_conclusion", "label": "审计结论", "type": "text"},
                    ],
                },
                {
                    "code": "bank_detail",
                    "name": "A1-2 银行存款明细",
                    "kind": "table",
                    "description": "按银行账户逐笔核对账面与询证函，差异自动计算。",
                    "columns": [
                        {"code": "bank_name", "label": "开户行", "type": "string", "width": 220},
                        {"code": "account_no", "label": "账号", "type": "string", "width": 180},
                        {"code": "currency", "label": "币种", "type": "string", "width": 60},
                        {"code": "book_balance", "label": "账面余额", "type": "money", "width": 140},
                        {"code": "confirmation_balance", "label": "询证函余额", "type": "money", "width": 140},
                        {"code": "diff", "label": "差异", "type": "money", "computed": True, "width": 100},
                        {"code": "is_anomaly", "label": "异常", "type": "boolean", "width": 60},
                        {"code": "note", "label": "差异说明", "type": "text", "width": 220},
                    ],
                },
                {
                    "code": "cash_count",
                    "name": "A1-3 库存现金盘点",
                    "kind": "table",
                    "description": "期末现金盘点结果与账面核对。",
                    "columns": [
                        {"code": "count_date", "label": "盘点日", "type": "date", "width": 120},
                        {"code": "location", "label": "盘点地点", "type": "string", "width": 160},
                        {"code": "currency", "label": "币种", "type": "string", "width": 60},
                        {"code": "book_amount", "label": "账面金额", "type": "money", "width": 140},
                        {"code": "physical_amount", "label": "实盘金额", "type": "money", "width": 140},
                        {"code": "diff", "label": "差异", "type": "money", "computed": True, "width": 100},
                        {"code": "counter", "label": "盘点人", "type": "string", "width": 120},
                        {"code": "note", "label": "备注", "type": "text", "width": 200},
                    ],
                },
                {
                    "code": "cutoff_test",
                    "name": "A1-4 截止性测试",
                    "kind": "table",
                    "description": "期末前后 5 个工作日凭证扫描，判定是否跨期。",
                    "columns": [
                        {"code": "voucher_no", "label": "凭证号", "type": "string", "width": 130},
                        {"code": "voucher_date", "label": "凭证日期", "type": "date", "width": 120},
                        {"code": "summary", "label": "摘要", "type": "string", "width": 220},
                        {"code": "amount", "label": "金额", "type": "money", "width": 140},
                        {"code": "should_belong_to", "label": "归属期间", "type": "enum",
                         "enum": ["本期", "下期"], "width": 100},
                        {"code": "is_proper", "label": "截止正确", "type": "boolean", "width": 80},
                        {"code": "note", "label": "备注", "type": "text", "width": 220},
                    ],
                },
            ],
        },
    )
    s.add(template); s.commit(); s.refresh(template)

    # Empty working paper for the demo — 4 sheets, all empty
    paper = ObjectInstance(
        type_code="WorkingPaper", display_name="A1 货币资金 - 星河制造 2025",
        data={
            "code": "WP-A1-2025-018", "name": "A1 货币资金",
            "template_code": "TPL-CASH-01",
            "engagement_code": "ENG-2025-018",
            "status": "未开始",
            "sheet_data": {
                "summary":     {"currency": "CNY"},
                "bank_detail": {"rows": []},
                "cash_count":  {"rows": []},
                "cutoff_test": {"rows": []},
            },
        },
    )
    s.add(paper); s.commit(); s.refresh(paper)
    s.add(LinkInstance(link_type_code="EngagementHasPaper", source_id=eng.id, target_id=paper.id))
    s.add(LinkInstance(link_type_code="PaperUsesTemplate", source_id=paper.id, target_id=template.id))
    s.commit()


# ---------- Agent seeds ----------

def _seed_agents(s: Session) -> None:
    if s.exec(select(AgentConfig)).first():
        return

    s.add(AgentConfig(
        code="cash_paper_fill",
        name="货币资金底稿填写助手",
        description="读取试算平衡表与凭证，按 A1 系列模板（主表 / 银行明细 / 现金盘点 / 截止性测试）逐子表填写，并应用审计规则。",
        scenario="working_paper_fill",
        avatar="ClipboardList",
        system_prompt=(
            "你是一名资深审计经理，擅长按中国注册会计师审计准则填写「货币资金」底稿 (A1 系列)。"
            "工作流程：(1) 调用 get_trial_balance 读取期末 TB；"
            "(2) 调用 get_vouchers_by_account 读取 1001 银行存款凭证（用于截止性测试）；"
            "(3) 依次调用 fill_sheet 填写 bank_detail / cash_count / cutoff_test / summary 四个子表；"
            "(4) 逐条调用 apply_rule 执行绑定规则；"
            "(5) 发现规则未通过时调用 flag_anomaly。"
            "金额保留两位小数；填表时识别跨期凭证并将 is_proper 设为 false。"
            "完成后用一段中文向用户解释你做了什么。"
        ),
        tools=[
            {"kind": "query", "ref": "get_trial_balance"},
            {"kind": "query", "ref": "get_vouchers_by_account"},
            {"kind": "action", "ref": "FillSheet"},
            {"kind": "action", "ref": "ApplyRule"},
            {"kind": "action", "ref": "FlagAnomaly"},
        ],
        retrieval_object_types=["WorkingPaper", "PaperTemplate", "AuditRule"],
        is_seed=True,
    ))

    s.add(AgentConfig(
        code="audit_plan_generator", name="审计方案生成助手",
        description="根据被审单位行业、规模与重大错报风险，生成年度审计总体方案与重要科目程序。",
        scenario="plan_generation", avatar="Map",
        system_prompt="你是审计总监，擅长制定年度审计方案。基于客户行业与规模草拟总体方案与关键审计事项。",
        tools=[{"kind": "query", "ref": "get_trial_balance"}],
        retrieval_object_types=["Client", "Engagement"],
        is_seed=True, is_stub=True,
    ))

    s.add(AgentConfig(
        code="anomaly_analyst", name="审计异常分析助手",
        description="对底稿与凭证中的异常进行根因分析、影响评估与处理建议。",
        scenario="anomaly_analysis", avatar="SearchCheck",
        system_prompt="你是反舞弊与异常分析专家。对识别出的异常对象做根因分析与处理建议。",
        tools=[{"kind": "query", "ref": "get_vouchers_by_account"}],
        retrieval_object_types=["Anomaly", "Voucher"],
        is_seed=True, is_stub=True,
    ))

    s.add(AgentConfig(
        code="special_audit_designer", name="专项审计方案设计助手",
        description="针对政府专项资金、关联交易、收入、商誉减值等专项议题，从案例库与公共法规中检索上下文，逐节起草审计方案。",
        scenario="special_audit", avatar="Target",
        system_prompt=(
            "你是专项审计总监，擅长起草定制化的专项审计方案。"
            "工作流程：(1) 调用 get_case_context 读取本案背景；"
            "(2) 调用 search_public_rules 拉取该专项类型适用的公共法规；"
            "(3) 调用 search_case_library 查询本所历史类似案例供参考；"
            "(4) 调用 draft_audit_plan 一次性写回完整 plan_sections — 包含 objectives / materiality / sampling / kams / risks / procedures / milestones；"
            "(5) 用一段中文给用户解释你的方案要点。"
            "金额按本案规模设定重要性水平；procedures 列表至少 8 步；每个 KAM 与 risk 与适用法规关联。"
        ),
        tools=[
            {"kind": "query", "ref": "get_case_context"},
            {"kind": "query", "ref": "search_public_rules"},
            {"kind": "query", "ref": "search_case_library"},
            {"kind": "action", "ref": "DraftAuditPlan"},
        ],
        retrieval_object_types=["SpecialAuditCase", "AuditRule", "Client"],
        is_seed=True, is_stub=False,
    ))
    s.commit()


# ---------- MCP seed ----------

def _seed_mcp(s: Session) -> None:
    if s.exec(select(MCPServer)).first():
        return
    s.add(MCPServer(
        name="filesystem",
        transport="stdio",
        command="npx",
        args=["-y", "@modelcontextprotocol/server-filesystem", "./data/evidence"],
        description="读取本地证据目录中的文件（PDF / 图片 / Excel）。",
        tools=[
            {"name": "read_file", "description": "读取文件内容",
             "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
            {"name": "list_directory", "description": "列出目录",
             "parameters": {"type": "object", "properties": {"path": {"type": "string"}}}},
        ],
    ))
    s.add(MCPServer(
        name="excel",
        transport="stdio",
        command="uvx",
        args=["mcp-server-excel"],
        description="读取与解析 Excel 工作底稿（科目余额、明细账）。",
        tools=[
            {"name": "read_sheet", "description": "读取 Excel 工作表",
             "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "sheet": {"type": "string"}}}},
        ],
        enabled=False,
    ))
    s.add(MCPServer(
        name="bank_confirmation",
        transport="http",
        command="",
        description="从银行询证函系统拉取回函数据（连接器示例）。",
        tools=[
            {"name": "fetch_confirmation", "description": "按银行账号查询回函",
             "parameters": {"type": "object", "properties": {"account_no": {"type": "string"}}, "required": ["account_no"]}},
        ],
        enabled=False,
    ))
    s.commit()


_QCC_BEARER = "Bearer MgFVtExYOXVMsQqDoFmPXPwQKJtb3MJSoLjVJymKaTSnMu1N"

QCC_SERVERS = [
    {
        "name": "qcc-company",
        "url": "https://agent.qcc.com/mcp/company/stream",
        "description": "企查查·企业基本信息：注册资本、法人、成立日期、股东、经营范围等。",
        "tools": [
            {
                "name": "getCompanyBaseInfo",
                "description": "获取企业基本注册信息（公司名称、统一社会信用代码、注册资本、法定代表人、成立日期、经营范围、注册地址）",
                "parameters": {
                    "type": "object",
                    "properties": {"keyword": {"type": "string", "description": "公司名称或统一社会信用代码"}},
                    "required": ["keyword"],
                },
            },
        ],
    },
    {
        "name": "qcc-risk",
        "url": "https://agent.qcc.com/mcp/risk/stream",
        "description": "企查查·企业风险：失信被执行人、行政处罚、司法诉讼等风险信息。",
        "tools": [
            {
                "name": "getCompanyRiskSummary",
                "description": "获取企业风险汇总（被执行信息、失信被执行人、行政处罚、司法诉讼记录数量和概要）",
                "parameters": {
                    "type": "object",
                    "properties": {"keyword": {"type": "string", "description": "公司名称或统一社会信用代码"}},
                    "required": ["keyword"],
                },
            },
        ],
    },
    {
        "name": "qcc-ipr",
        "url": "https://agent.qcc.com/mcp/ipr/stream",
        "description": "企查查·知识产权：专利、商标、著作权等知识产权信息。",
        "tools": [
            {
                "name": "getCompanyIPR",
                "description": "获取企业知识产权信息（专利数量及类型、商标注册、软件著作权）",
                "parameters": {
                    "type": "object",
                    "properties": {"keyword": {"type": "string", "description": "公司名称"}},
                    "required": ["keyword"],
                },
            },
        ],
    },
    {
        "name": "qcc-operation",
        "url": "https://agent.qcc.com/mcp/operation/stream",
        "description": "企查查·经营信息：分支机构、对外投资、招投标、资质认证等。",
        "tools": [
            {
                "name": "getCompanyOperation",
                "description": "获取企业经营信息（分支机构列表、对外投资情况、招投标记录、行业资质）",
                "parameters": {
                    "type": "object",
                    "properties": {"keyword": {"type": "string", "description": "公司名称"}},
                    "required": ["keyword"],
                },
            },
        ],
    },
    {
        "name": "qcc-executive",
        "url": "https://agent.qcc.com/mcp/executive/stream",
        "description": "企查查·管理层信息：董事、监事、高管及其关联关系穿透。",
        "tools": [
            {
                "name": "getCompanyExecutives",
                "description": "获取企业管理层信息（法人、董事、监事、高管名单及其在其他企业的任职情况）",
                "parameters": {
                    "type": "object",
                    "properties": {"keyword": {"type": "string", "description": "公司名称"}},
                    "required": ["keyword"],
                },
            },
        ],
    },
    {
        "name": "qcc-history",
        "url": "https://agent.qcc.com/mcp/history/stream",
        "description": "企查查·历史变更：公司名称、股权、法人等历史变更记录。",
        "tools": [
            {
                "name": "getCompanyHistory",
                "description": "获取企业工商变更历史（名称变更、注册资本变更、法定代表人变更、股东变更记录）",
                "parameters": {
                    "type": "object",
                    "properties": {"keyword": {"type": "string", "description": "公司名称"}},
                    "required": ["keyword"],
                },
            },
        ],
    },
]


def _seed_qcc_mcp(s: Session) -> None:
    """Seed QCC MCP servers (企查查 online data — HTTP/SSE transport)."""
    existing_names = {srv.name for srv in s.exec(select(MCPServer)).all()}
    for spec in QCC_SERVERS:
        if spec["name"] in existing_names:
            continue
        s.add(MCPServer(
            name=spec["name"],
            transport="http",
            url=spec["url"],
            headers={"Authorization": _QCC_BEARER},
            description=spec["description"],
            tools=spec["tools"],
            enabled=True,
        ))
    s.commit()


def _seed_banmu_engagement(s: Session) -> None:
    """Seed 无锡斑目信息技术有限公司 engagement + skeleton working papers."""
    existing = s.exec(
        select(ObjectInstance).where(ObjectInstance.type_code == "Engagement")
    ).all()
    codes = [e.data.get("code", "") for e in existing if isinstance(e.data, dict)]
    if "ENG-BANMU-2024" in codes:
        return  # already seeded

    eng = ObjectInstance(
        type_code="Engagement",
        display_name="无锡斑目信息技术有限公司 2024年报审计",
        data={
            "code": "ENG-BANMU-2024",
            "status": "进行中",
            "period": "2024-12-31",
            "partner": "东林合伙人",
            "industry": "软件信息服务",
            "planned_fee": 30000.0,
            "company_name": "无锡斑目信息技术有限公司",
            "short_name": "斑目科技",
        },
    )
    s.add(eng)
    s.commit()

    BANMU_PAPERS = [
        ("Y3", "重要性水平"),
        ("Y5", "企业规模与审计策略"),
        ("Y8", "风险评估与应对"),
        ("X1", "企业基本情况"),
        ("X4", "内控了解"),
        ("X8", "内控有效性"),
        ("A1", "货币资金"),
        ("A6", "应收账款"),
        ("A9", "其他应收款"),
        ("A10", "存货"),
        ("A24", "固定资产"),
        ("B1", "短期借款"),
        ("B9", "应付职工薪酬"),
        ("D1", "主营业务收入"),
        ("Z5", "审计报告"),
        ("Z6", "审计调整"),
        ("Z7", "管理层声明书"),
        ("Z12", "未更正错报汇总"),
        ("ZS", "附注核查"),
    ]
    for idx, name in BANMU_PAPERS:
        s.add(ObjectInstance(
            type_code="WorkingPaper",
            display_name=f"{idx} {name}",
            data={
                "index": idx,
                "name": name,
                "engagement_code": "ENG-BANMU-2024",
                "review_status": "未启动",
                "template_code": "TPL-DL-FY2025",
            },
        ))
    s.commit()
    print("[banmu] Seeded ENG-BANMU-2024 engagement + working papers")


# ---------- Entry ----------

def seed() -> None:
    """只装载东林（江苏大王 2025）本体。
    pilot-demo 内置的 OT/LT/AT/示例数据/agents/MCP 已停用 —— 如需恢复请将
    AUDIT_ONTOLOGY_INCLUDE_PILOT_DEMO=1，或直接修改本函数。"""
    from .db import init_db
    init_db()

    import os
    if os.environ.get("AUDIT_ONTOLOGY_INCLUDE_PILOT_DEMO", "0") == "1":
        with Session(engine) as s:
            existing = {ot.code for ot in s.exec(select(ObjectType))}
            for spec in OBJECT_TYPES:
                if spec["code"] in existing:
                    continue
                s.add(ObjectType(is_seed=True, **spec))
            s.commit()

            existing_lt = {lt.code for lt in s.exec(select(LinkType))}
            for code, name, src, tgt, card in LINK_TYPES:
                if code in existing_lt:
                    continue
                s.add(LinkType(code=code, display_name=name, source_type_code=src,
                               target_type_code=tgt, cardinality=card, is_seed=True))
            s.commit()

            existing_at = {at.code for at in s.exec(select(ActionType))}
            for spec in ACTION_TYPES:
                if spec["code"] in existing_at:
                    continue
                s.add(ActionType(is_seed=True, **spec))
            s.commit()

            _seed_sample_data(s)
            _seed_extra_rules(s)
            _seed_extra_templates(s)
            _seed_history_cases(s)
            _seed_active_case(s)
            _seed_agents(s)
            _seed_mcp(s)

    # ─── 东林样式审计本体 (江苏大王 2025 案例) ────────────────────
    # 50 OT + 73 LT + 11 AT + 95+ 实例 + 5 张已填底稿 + 4250 单元格追溯
    if os.environ.get("AUDIT_ONTOLOGY_SKIP_DONGLIN", "0") != "1":
        try:
            from .seed_donglin import seed_donglin
            seed_donglin()
        except Exception as e:
            print(f"[donglin] seed skipped due to error: {e}")

    # ─── QCC MCP servers (always seed, independent of pilot-demo flag) ────
    with Session(engine) as s:
        _seed_qcc_mcp(s)
        _seed_banmu_engagement(s)


if __name__ == "__main__":
    seed()
    print("Seeded ontology + sample data.")
