"""注入 AuditMethod (审计方法/算法) — 10 个核心算法实例。

把原来散在 agent_fill.py 里的算法逻辑结构化成本体实例,
让审计师能 review 算法选择、形式化逻辑、适用条件、降级方案。
"""
from __future__ import annotations
from sqlmodel import Session, select
from ..db import engine
from ..models import ObjectInstance, ObjectType


METHODS = [
    # ── 账龄计算 ──
    {
        "code": "METHOD-AGING-FIFO-001",
        "name": "FIFO 账龄方法",
        "category": "账龄计算",
        "algorithm_description": "按客户凭证日期堆叠借方层（Dr layer），opening_cr + 期间 Cr 形成信用池。按 FIFO 冲销最旧的 Dr 层。剩余 Dr 层按 voucher_date 距 cutoff_date 的天数分桶到 365/730/1095 天的 4 个桶。",
        "formal_logic": """layers = [Layer(opening_dr, 2024-12-31)]
        + [Layer(v.dr, v.date) for v in vouchers]
credit_pool = opening_cr + sum(v.cr for v in vouchers)
while credit_pool > 0 and layers:
    if layers[0].amount <= credit_pool:
        credit_pool -= layers[0].amount
        layers.pop(0)
    else:
        layers[0].amount -= credit_pool
        credit_pool = 0
for layer in layers:
    days = (cutoff - layer.date).days
    bucket = 'within_1y' if days <= 365
           else '1_to_2y' if days <= 730
           else '2_to_3y' if days <= 1095
           else 'over_3y'
    buckets[bucket] += layer.amount""",
        "inputs": "opening_dr, opening_cr, vouchers[date, dr, cr], cutoff_date",
        "outputs": "{within_1y, 1_to_2y, 2_to_3y, over_3y}",
        "applicability": "客户在 12,620 笔凭证里有 ≥ 1 笔匹配 party_code",
        "fallback_method": "METHOD-AGING-NO-VOUCHER-001 (无凭证降级规则)",
        "references_standards": ["CAS 22", "CSA 1311"],
        "firm_choice_rationale": "东林选 FIFO 而非 LIFO，理由：① 更符合企业实际经营逻辑（先发生的应收先收回）② 与 ECL 模型更兼容 ③ 行业惯例",
        "review_severity": "关键 - 影响判断",
        "source_code_ref": "agent_fill.py:419-453 (compute_aging 函数)",
        "review_status": "AI 抽取候选，待审计师 sign-off",
    },
    {
        "code": "METHOD-AGING-NO-VOUCHER-001",
        "name": "无凭证降级规则",
        "category": "账龄计算",
        "algorithm_description": "当客户在 12,620 笔凭证里找不到匹配 party_code 时（约 130 客户），保守地把全部期末借方余额置入 1-2 年账龄桶。判定逻辑：客户编码已变更或为期初遗留账，必定从前期滚动而来，按行业惯例保守置 1-2 年。",
        "formal_logic": """if not cust_vouchers:
    buckets = {
        'within_1y': 0,
        '1_to_2y': closing_dr,
        '2_to_3y': 0,
        'over_3y': 0
    }""",
        "inputs": "closing_dr (来自辅助账)",
        "outputs": "{within_1y: 0, 1_to_2y: closing_dr, 2_to_3y: 0, over_3y: 0}",
        "applicability": "凭证里找不到 party_code 的客户",
        "fallback_method": "无 - 这是终极降级",
        "references_standards": ["CAS 22", "CSA 1141 (审慎性原则)"],
        "firm_choice_rationale": "保守置 1-2 年是行业默认 — 既不能放 within_1y 显得过于乐观，也不能放 over_3y 显得过于保守",
        "review_severity": "重要 - 影响金额分布",
        "source_code_ref": "agent_fill.py:664-669 (A6 fill 无凭证分支)",
        "review_status": "AI 推测，须审计师确认本所采用的降级策略",
    },
    # ── 折旧重算 ──
    {
        "code": "METHOD-DEP-STRAIGHT-001",
        "name": "直线法折旧重算 (按资产类别加权)",
        "category": "折旧重算",
        "algorithm_description": "按客户折旧政策 (X5/ZS4 披露) 重算本期折旧：估算各资产类别的占比 + 平均原值，按 (原值 × (1 − 残值率) ÷ 使用年限) 重算年折旧。资产类别构成假设：机器 51% / 运输 45% / 电子 4%（行业惯例 + 客户访谈）。",
        "formal_logic": """for category in ['机器', '运输', '电子', '房屋', '办公']:
    weight = category_weight[category]
    estimated_cost = avg_cost_total * weight
    annual_dep = estimated_cost * (1 - 0.05) / useful_life[category]
    recomputed_dep += annual_dep
diff = book_dep - recomputed_dep""",
        "inputs": "avg_cost_total, category_weights, useful_life_by_category, salvage_rate (5%)",
        "outputs": "{recomputed_dep, diff, diff_pct}",
        "applicability": "客户采用直线法折旧 + 残值率 5%",
        "fallback_method": "若客户用其他方法 (双倍余额递减/年数总和)，需重新实现该方法",
        "references_standards": ["CAS 4", "CAS 8", "CSA 1221"],
        "firm_choice_rationale": "直线法是中国大部分制造企业默认；类别权重 51/45/4 是审计师按行业经验估算，需客户披露具体类别构成验证",
        "review_severity": "重要 - 影响差异判断",
        "source_code_ref": "agent_fill.py:fill_A24 内嵌公式",
        "review_status": "AI 抽取，权重假设需审计师 review",
    },
    # ── 重要性梯度 ──
    {
        "code": "METHOD-MAT-GRADIENT-001",
        "name": "CSA 1221 四级重要性梯度判定",
        "category": "重要性梯度",
        "algorithm_description": "按 CSA 1221 重要性梯度，把差异按金额分到 4 个等级：SUM (< 重要性 5%) → 自动通过 / TE (< 75%重要性) → 通过 / PM (< 100%重要性) → 需细节测试 / Material (≥ 100%重要性) → 重大差异",
        "formal_logic": """sum_threshold = pm * 0.05      # 7,727.24
te = pm * 0.75                  # 115,908.53
material = pm                   # 154,544.70
if abs(diff) < sum_threshold:    level = 'SUM (微小)'; pass
elif abs(diff) < te:             level = 'TE (容忍)'; pass
elif abs(diff) < material:       level = 'PM (重要性)'; needs_detail_test
else:                            level = 'Material (重大)'; flag""",
        "inputs": "diff (审计差异), pm (整体重要性)",
        "outputs": "{level, passes_test, next_action}",
        "applicability": "所有审定表的差异判定",
        "fallback_method": "无",
        "references_standards": ["CSA 1221"],
        "firm_choice_rationale": "比例 5%/75%/100% 是 CSA 1221 标准做法，本所未做调整",
        "review_severity": "关键 - 影响审计意见",
        "source_code_ref": "agent_fill.py:fill_A24 内嵌 if-elif 链",
        "review_status": "公开准则，已被中注协认可",
    },
    # ── 银行账户映射 ──
    {
        "code": "METHOD-BANK-MAP-001",
        "name": "银行账户映射 (BANK_MAP)",
        "category": "数据映射",
        "algorithm_description": "把客户 TB 里的 1001/1002/1012 子目代码映射到银行账户、银行名、币种。这是事务所积累的字典：10 个常见子目（南京银行 / 江苏银行 / 农行 / 浙商 / 票据保证金 / 等）。",
        "formal_logic": """BANK_MAP = {
    '100201': ('银行存款', '中国农业银行惠山支行', 'CNY'),
    '100202': ('银行存款', '浙商银行', 'CNY'),
    '101201': ('其他货币资金', '票据保证金', 'CNY'),
    # ... 10 个映射
}
for sub_code in tb_1001_subs:
    category, bank_name, currency = BANK_MAP.get(sub_code, ('未知', '需补充', 'CNY'))""",
        "inputs": "TB 子目代码 (如 100201)",
        "outputs": "(category, bank_name, currency)",
        "applicability": "TB 的 1001/1002/1012 子目代码",
        "fallback_method": "未匹配的子目标 ('未知', '需补充', 'CNY')",
        "references_standards": ["CAS 30 财务报表列报"],
        "firm_choice_rationale": "事务所沉淀的银行账户字典，每个客户复用 + 增量补充",
        "review_severity": "辅助 - 不影响结论",
        "source_code_ref": "agent_fill.py:138-149 BANK_MAP 字典",
        "review_status": "本所内部字典，需要持续维护",
    },
    # ── 受限资金判定 ──
    {
        "code": "METHOD-RESTRICTED-CASH-001",
        "name": "受限资金判定 (8 类情形)",
        "category": "受限资金判定",
        "algorithm_description": "按 CAS 22 + CAS 30 + 中注协实务，受限资金有 8 类情形：① 票据保证金 ② 信用证保证金 ③ 借款保证金 ④ 司法冻结 ⑤ 法律法规专款专用 ⑥ 跨境/外汇管制 ⑦ 期限>12个月定期 ⑧ 合同约定不能挪用",
        "formal_logic": """def is_restricted(account):
    return any([
        account.is_margin_account(),                  # ①②③
        account.is_court_frozen(),                    # ④
        account.has_legal_designation(),              # ⑤
        account.is_cross_border_restricted(),         # ⑥
        account.is_long_term_deposit(),               # ⑦
        account.has_contract_restriction(),           # ⑧
    ])
# ⚠ 当前实现仅覆盖 ① (用 category == '其他货币资金' 反推)
# 这是 12.5% 覆盖率，需扩展""",
        "inputs": "银行账户对象 (含合同 / 司法状态 / 期限 / 用途)",
        "outputs": "is_restricted (bool) + restriction_reason",
        "applicability": "所有银行存款 + 其他货币资金科目",
        "fallback_method": "无 - 需逐账户尽职调查",
        "references_standards": ["CAS 22 第 16 条", "CAS 30 财务报表列报"],
        "firm_choice_rationale": "目前简化版仅 1/8 覆盖。完整版需要客户提供保证金合同 / 司法文书 / 外汇管制函等证据",
        "review_severity": "关键 - 影响列报和披露",
        "source_code_ref": "agent_fill.py:282 一行 (严重简化)",
        "review_status": "⚠️ 当前实现严重不足 - 待重做",
    },
    # ── 收入截止 ──
    {
        "code": "METHOD-CUTOFF-REVENUE-001",
        "name": "收入截止 ±5 工作日窗口",
        "category": "截止测试",
        "algorithm_description": "扫描期末前后 5 工作日的收入凭证（6001 主营业务收入），逐笔比对发货单 / 验收单日期，判断收入归属期。窗口 = ±5 工作日避免漏过跨期。",
        "formal_logic": """window_start = period_end - 5_workdays  # 2025-12-24
window_end = period_end + 5_workdays    # 2026-01-07
cutoff_vouchers = [v for v in vouchers
                   if v.account.startswith('6001')
                   and window_start <= v.date <= window_end]
for v in cutoff_vouchers:
    is_proper = v.date <= period_end and v.shipment_date <= period_end
    if not is_proper:
        flag(f'{v.no} 收入归属期可能错误')""",
        "inputs": "vouchers, period_end (2025-12-31)",
        "outputs": "[{voucher_no, voucher_date, amount, is_proper}]",
        "applicability": "6001 主营业务收入科目的凭证",
        "fallback_method": "若客户无发货单 → 改用合同确认日期",
        "references_standards": ["CSA 1141 (收入舞弊默认风险)", "CAS 14 收入"],
        "firm_choice_rationale": "5 工作日是中注协推荐窗口；过短会漏，过长成本高",
        "review_severity": "关键 - CSA 1141 默认舞弊风险",
        "source_code_ref": "agent_fill.py:fill_A1 cutoff_test 部分",
        "review_status": "公开准则做法",
    },
    # ── 关联担保 ──
    {
        "code": "METHOD-GUARANTEE-COVERAGE-001",
        "name": "关联担保覆盖率计算",
        "category": "持续经营",
        "algorithm_description": "计算关联方担保覆盖率 = Σ 关联担保金额 / Σ 贷款本金。100% 触发持续经营关注 (GC-INDICATOR-001)。",
        "formal_logic": """total_principal = sum(loan.principal for loan in loans)
total_guarantee = sum(g.amount for g in guarantees
                      if g.guarantor_is_related_party)
coverage_ratio = total_guarantee / total_principal
if coverage_ratio >= 1.0:
    trigger_going_concern_flag()""",
        "inputs": "短期借款列表 + 关联担保列表",
        "outputs": "coverage_ratio (0.0 ~ 1.0+) + going_concern_flag",
        "applicability": "B1 短期借款 + B15 长期借款审计",
        "fallback_method": "无",
        "references_standards": ["CSA 1324 持续经营", "CSA 1502 强调事项段"],
        "firm_choice_rationale": "100% 阈值是行业惯例；事务所可调整为 70-80% 作为预警",
        "review_severity": "关键 - 影响持续经营意见",
        "source_code_ref": "agent_fill.py:fill_B1 末尾计算",
        "review_status": "AI 抽取，须审计师 review 阈值",
    },
    # ── 加权平均利率 ──
    {
        "code": "METHOD-WEIGHTED-RATE-001",
        "name": "加权平均利率计算",
        "category": "利息重算",
        "algorithm_description": "按本金加权计算多笔贷款的平均利率。然后用平均利率 × 总本金重算年利息，与账面利息比对差异。",
        "formal_logic": """weighted_avg_rate = sum(loan.principal * loan.rate for loan in loans) \\
                  / sum(loan.principal for loan in loans)
recomputed_annual_interest = total_principal * weighted_avg_rate
interest_diff = book_interest - recomputed_annual_interest""",
        "inputs": "loans[{principal, rate}], book_interest",
        "outputs": "{weighted_avg_rate, recomputed_interest, interest_diff, interest_diff_pct}",
        "applicability": "B1 短期借款利息重算",
        "fallback_method": "若各笔贷款起止日不同，需逐笔按月计算（精算版）",
        "references_standards": ["CAS 22 金融工具"],
        "firm_choice_rationale": "简化假设全年活跃。误差通常 < 15%，对小型客户够用",
        "review_severity": "重要 - 影响利息差异判断",
        "source_code_ref": "agent_fill.py:fill_B1 内嵌",
        "review_status": "简化算法，差异>10% 时需切换精算版",
    },
    # ── Top 5 集中度 ──
    {
        "code": "METHOD-TOP5-CONCENTRATION-001",
        "name": "Top 5 客户集中度",
        "category": "客户分析",
        "algorithm_description": "按借方余额降序取前 5 个客户，计算合计金额占总应收比例。集中度 > 50% 提示客户依赖风险。",
        "formal_logic": """sorted_customers = sorted(customers, key=lambda c: c.closing_dr, reverse=True)
top5 = sorted_customers[:5]
top5_sum = sum(c.closing_dr for c in top5)
top5_concentration_pct = top5_sum / total_dr_balance""",
        "inputs": "customers[{code, closing_dr}], total_dr_balance",
        "outputs": "top5_concentration_pct, top5_customers",
        "applicability": "A6 应收账款审定",
        "fallback_method": "无",
        "references_standards": ["CAS 22", "CSA 1311"],
        "firm_choice_rationale": "Top 5 是行业默认；某些事务所用 Top 10",
        "review_severity": "辅助 - 风险提示",
        "source_code_ref": "agent_fill.py:fill_A6 客户排序部分",
        "review_status": "通用做法",
    },
]


def seed_audit_methods(session: Session = None) -> dict[str, int]:
    if session is None:
        with Session(engine) as s:
            return _do(s)
    return _do(session)


def _do(s: Session) -> dict[str, int]:
    stats = {"OT_added": 0, "Method_added": 0}

    # 1. 加 AuditMethod OT (如不存在)
    existing_ot = {ot.code for ot in s.exec(select(ObjectType))}
    if "AuditMethod" not in existing_ot:
        s.add(ObjectType(
            code="AuditMethod",
            display_name="审计方法/算法",
            description="[L1] [东林·程序] 审计师可 review 的算法实例 (FIFO 账龄 / 直线折旧 / 重要性梯度 等)",
            icon="Calculator", color="#d946ef", is_seed=True,
            properties_schema=[
                {"code": "code", "label": "方法代号", "type": "string", "required": True},
                {"code": "name", "label": "方法名", "type": "string"},
                {"code": "category", "label": "类别", "type": "enum",
                 "enum": ["账龄计算", "折旧重算", "利息重算", "重要性梯度",
                          "数据映射", "受限资金判定", "截止测试", "持续经营",
                          "客户分析", "降级处理"]},
                {"code": "algorithm_description", "label": "算法描述 (自然语言)", "type": "text"},
                {"code": "formal_logic", "label": "形式化逻辑 (伪代码)", "type": "text"},
                {"code": "inputs", "label": "输入参数", "type": "string"},
                {"code": "outputs", "label": "输出格式", "type": "string"},
                {"code": "applicability", "label": "适用条件", "type": "text"},
                {"code": "fallback_method", "label": "降级方法代号", "type": "string"},
                {"code": "references_standards", "label": "引用准则", "type": "json"},
                {"code": "firm_choice_rationale", "label": "事务所为何选这个", "type": "text"},
                {"code": "review_severity", "label": "审计师 review 严重度",
                 "type": "enum", "enum": ["关键 - 影响判断", "重要 - 影响金额", "辅助 - 不影响结论"]},
                {"code": "source_code_ref", "label": "源代码位置", "type": "string"},
                {"code": "review_status", "label": "Review 状态", "type": "string"},
            ],
        ))
        stats["OT_added"] += 1
    s.commit()

    # 2. 注入 10 个 method 实例
    existing_methods = {(o.data or {}).get("code")
                        for o in s.exec(select(ObjectInstance).where(
                            ObjectInstance.type_code == "AuditMethod"))}

    for m in METHODS:
        if m["code"] in existing_methods:
            continue
        s.add(ObjectInstance(
            type_code="AuditMethod",
            display_name=m["name"],
            data={**m, "_layer": "L1", "_source": "agent_fill.py 抽取"},
        ))
        stats["Method_added"] += 1
    s.commit()
    return stats


if __name__ == "__main__":
    stats = seed_audit_methods()
    print(f"[seed_methods] {stats}")
