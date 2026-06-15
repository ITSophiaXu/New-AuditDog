"""把 Agent 在 5 张 demo 底稿中实际发现但未结构化的异常补录为 Anomaly 实例。

每条异常生成一个 :Anomaly ObjectInstance，跟 WorkingPaper 用 paper_id 关联。
"""
from __future__ import annotations
from datetime import datetime

from sqlmodel import Session, select

from ..db import engine
from ..models import ObjectInstance


# 5 张 demo 底稿的具体异常清单
# (paper_index, severity, title, detail, triggered_by, recommendation)
DONGLIN_ANOMALIES = [
    # —— A1 货币资金 ——
    ("A1", "medium", "浙商银行余额 ¥42,060 未入账",
     "审计发现浙商银行存款 ¥42,060.08 未在客户账面体现，来源系老板刷单。建议补登账面或调整分录。",
     "manual_review", "建议补登"),
    ("A1", "medium", "票据保证金未列示",
     "根据银行回函，前会计票据账务处理错误，导致账面无保证金列示，由此调增货币资金。",
     "CASH-RULE-001", "增加披露"),

    # —— A6 应收账款 ——
    ("A6", "high", "153 个客户贷方余额需重分类",
     "AR-RULE-001 命中 153 个客户期末贷方余额合计 ¥7,114,390.40，建议重分类至 2203 预收款项。已自动生成 Z6-AI-A6-01 调整分录。",
     "AR-RULE-001", "已建议 Z6-AI-A6-01"),
    ("A6", "low", "RP-RULE-001 因客户名匿名未能命中",
     "客户名经过匿名化处理（如 '000860公司'），导致 RP-RULE-001 关联方资金占用规则未能命中。需要人工根据脱敏对照表补充识别。",
     "RP-RULE-001", "人工补充关联方识别"),

    # —— A9 其他应收款 ——
    ("A9", "high", "1133 出口退税款 ¥-430K 反向余额",
     "1133 应收出口退税款期末出现贷方余额 ¥-430,610.14（反向），实质为已退税但账面未冲销。TAX-RECLASS-001 已触发，建议重分类至 22210106 应交税费-出口抵减。",
     "TAX-RECLASS-001", "已建议 Z6-AI-A9-01"),
    ("A9", "high", "黄燕红其他应收款 ¥811,739.84 超 PM 5.25 倍",
     "关联自然人黄燕红的其他应收款余额 ¥811,739.84，超过 PM ¥154,544.70 的 5.25 倍。需在 ZK5 关联方段单独披露。",
     "RP-RULE-001", "ZK5 关联方披露"),

    # —— A24 固定资产 ——
    ("A24", "high", "折旧重算差异 ¥125,020 ≥ TE ¥115,908",
     "按 X5 客户折旧政策（直线法/残值5%/年限按类别）重算本期折旧 ¥636,405.24，账面 ¥511,385.09，差异 ¥-125,020.15（-24.45%）。按 CSA 1221 四级梯度判定，差异 ≥ TE → 需细节测试。",
     "FA-RULE-001", "需细节测试 / 复核客户提供的资产构成"),

    # —— B1 短期借款 ——
    ("B1", "high", "100% 关联担保 → 持续经营关注",
     "5 笔短期借款共 ¥12,400,000 全部由实控人 杨春平 + 黄燕红 连带担保。关联担保覆盖率 100%，触发 GC-INDICATOR-001 持续经营关注信号。需评估 12 个月内偿债能力 + 关联方代偿意愿与能力。",
     "GC-INDICATOR-001", "ZK4 持续经营段披露 + Y9 复评"),
    ("B1", "medium", "重算利息差异 ¥36,114 (+10.30%)",
     "重算年利息 ¥314,600（简化假设全年活跃）vs 账面 ¥350,714.32，差异 ¥36,114.32（+10.30%）。差异主要源自各贷款实际起止日不同 + 上年余额产生的利息。需获取按月利息计提表精算。",
     "INT-RULE-001", "获取按月利息计提表精算"),
]


def seed_donglin_anomalies(session: Session = None) -> int:
    """注入 Anomaly 实例。返回新增条数。"""
    if session is None:
        with Session(engine) as s:
            return _do_seed(s)
    return _do_seed(session)


def _do_seed(s: Session) -> int:
    # 找到所有 WorkingPaper 的 index → id 映射
    wps = list(s.exec(select(ObjectInstance).where(
        ObjectInstance.type_code == "WorkingPaper")))
    paper_index_to_id = {(wp.data or {}).get("index"): wp.id for wp in wps}

    # 已有的 Anomaly key 集合（防止重复）
    existing = list(s.exec(select(ObjectInstance).where(
        ObjectInstance.type_code == "Anomaly")))
    existing_titles = {(a.data or {}).get("title") for a in existing}

    n = 0
    for idx, severity, title, detail, triggered_by, recommendation in DONGLIN_ANOMALIES:
        if title in existing_titles:
            continue
        paper_id = paper_index_to_id.get(idx)
        if not paper_id:
            continue
        s.add(ObjectInstance(
            type_code="Anomaly",
            display_name=f"{idx} · {title[:30]}",
            data={
                "paper_id": paper_id,
                "paper_index": idx,
                "severity": severity,
                "title": title,
                "detail": detail,
                "triggered_by": triggered_by,
                "recommendation": recommendation,
                "_layer": "L0",
                "_source": "agent_fill 实际发现",
                "discovered_at": datetime.utcnow().isoformat(),
            },
        ))
        n += 1
    s.commit()
    return n


if __name__ == "__main__":
    n = seed_donglin_anomalies()
    print(f"[seed_anomalies] 注入 {n} 条 Anomaly 实例")
