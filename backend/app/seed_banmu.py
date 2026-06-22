"""己公司（信息技术） (ENG-BANMU-2024) 审计项目 seed.

装载己公司 Engagement + WorkingPaper 骨架，并使用 banmu/fill.py 预填
所有有 fill_* 函数的底稿（sheet_data + review_status），使项目切换后
底稿工作台可直接展示 AI 初稿内容。
"""
from __future__ import annotations

from sqlmodel import Session, select

from .db import engine
from .models import ObjectInstance

ENG_CODE = "ENG-BANMU-2024"

BANMU_PAPERS = [
    ("Y3",  "重要性水平"),
    ("Y5",  "企业规模与审计策略"),
    ("Y8",  "风险评估与应对"),
    ("X1",  "企业基本情况"),
    ("X4",  "内控了解"),
    ("X8",  "内控有效性"),
    ("A1",  "货币资金"),
    ("A6",  "应收账款"),
    ("A9",  "其他应收款"),
    ("A10", "存货"),
    ("A24", "固定资产"),
    ("B1",  "短期借款"),
    ("B9",  "应付职工薪酬"),
    ("D1",  "主营业务收入"),
    ("Z5",  "审计报告"),
    ("Z6",  "审计调整"),
    ("Z7",  "管理层声明书"),
    ("Z12", "未更正错报汇总"),
    ("ZS",  "附注核查"),
]


def seed_banmu(skip_if_exists: bool = True) -> dict[str, int]:
    """装载己公司 Engagement + WorkingPaper，预填有 fill 函数的底稿。"""
    stats = {"Engagement": 0, "WorkingPaper": 0, "Prefilled": 0}

    with Session(engine) as s:
        # ── 1. Engagement ──────────────────────────────────────────────────
        existing_codes = [
            e.data.get("code", "")
            for e in s.exec(select(ObjectInstance).where(ObjectInstance.type_code == "Engagement"))
            if isinstance(e.data, dict)
        ]
        if ENG_CODE not in existing_codes:
            s.add(ObjectInstance(
                type_code="Engagement",
                display_name="己公司（信息技术） 2024年报审计",
                data={
                    "code": ENG_CODE,
                    "status": "进行中",
                    "period": "2024-12-31",
                    "partner": "甲所合伙人",
                    "industry": "软件信息服务",
                    "planned_fee": 30000.0,
                    "company_name": "己公司（信息技术）",
                    "short_name": "己公司",
                    "accounting_standard": "企业会计制度（财会〔2000〕25号）",
                },
            ))
            s.commit()
            stats["Engagement"] += 1

        # ── 2. WorkingPaper 骨架 ────────────────────────────────────────────
        existing_wp_indices = {
            (obj.data or {}).get("index")
            for obj in s.exec(
                select(ObjectInstance).where(ObjectInstance.type_code == "WorkingPaper")
            )
            if (obj.data or {}).get("engagement_code") == ENG_CODE
        }

        for idx, name in BANMU_PAPERS:
            if skip_if_exists and idx in existing_wp_indices:
                continue
            s.add(ObjectInstance(
                type_code="WorkingPaper",
                display_name=f"{idx} {name}",
                data={
                    "index": idx,
                    "name": name,
                    "engagement_code": ENG_CODE,
                    "review_status": "未启动",
                    "template_code": "TPL-DL-FY2025",
                },
            ))
            stats["WorkingPaper"] += 1
        s.commit()

        # ── 3. 预填底稿（有 fill_* 函数的科目）────────────────────────────
        from .banmu.fill import FILL_FNS

        all_papers = {
            (obj.data or {}).get("index"): obj
            for obj in s.exec(
                select(ObjectInstance).where(ObjectInstance.type_code == "WorkingPaper")
            )
            if (obj.data or {}).get("engagement_code") == ENG_CODE
        }

        acct_std = "企业会计制度（财会〔2000〕25号）"

        for paper_index, fill_fn in FILL_FNS.items():
            wp = all_papers.get(paper_index)
            if wp is None:
                continue
            # 跳过已有 sheet_data 的底稿（不覆盖已人工修改的内容）
            if skip_if_exists and (wp.data or {}).get("sheet_data"):
                continue
            try:
                import inspect
                kwargs = {}
                if "accounting_standard" in inspect.signature(fill_fn).parameters:
                    kwargs["accounting_standard"] = acct_std
                result = fill_fn(**kwargs)
                new_data = dict(wp.data or {})
                new_data["sheet_data"] = result.sheet_data
                new_data["review_status"] = "待人工确认" if result.decisions else "AI 初稿"
                new_data["ai_prefilled_at"] = "seed"
                wp.data = new_data
                s.add(wp)
                stats["Prefilled"] += 1
            except Exception as e:
                print(f"[banmu] prefill {paper_index} skipped: {e}")

        s.commit()

    print(
        f"[banmu] seeded: Engagement={stats['Engagement']} / "
        f"WorkingPaper={stats['WorkingPaper']} / Prefilled={stats['Prefilled']}"
    )
    return stats
