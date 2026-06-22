"""甲公司 (甲会计师事务所样式) 审计本体 seed.

加载 pilot_jsdw 抽取的 50 ObjectType + 73 LinkType + 11 ActionType + 95+ ObjectInstance +
117+ LinkInstance + 4 AgentConfig + 5 张已填底稿 + 4250+ 单元格追溯 到 pilot-demo 数据库。

数据来源：甲公司（通风机械） 2025 年度审计材料，由 audit-knowledge 项目抽取。
事务所：甲会计师事务所。
"""
from __future__ import annotations
import json
from pathlib import Path

from sqlmodel import Session, select

from .db import engine
from .models import (
    ObjectType, LinkType, ActionType,
    ObjectInstance, LinkInstance,
    AgentConfig,
)

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "donglin"
DEMO_DIR = DATA_DIR / "agent_demo"


def _load(name: str):
    p = DATA_DIR / name
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def _strip_meta(spec: dict) -> dict:
    """剥离 _cluster / _layer 等非模型字段；编码进 description 头部以便前端解析。
    最终格式: '[L3:donglin] [甲所·客户类] 原描述...'
    """
    cluster = spec.get("_cluster")
    layer = spec.get("_layer")
    clean = {k: v for k, v in spec.items() if not k.startswith("_")}
    original_desc = clean.get("description", "") or ""
    prefixes = []
    if layer:
        prefixes.append(f"[{layer}]")
    if cluster:
        prefixes.append(f"[甲所·{cluster}]")
    if prefixes:
        clean["description"] = " ".join(prefixes + [original_desc]).strip()
    return clean


def seed_donglin(skip_if_exists: bool = True) -> dict[str, int]:
    """装载甲所样式本体 + 已填底稿。返回各项计数。"""
    stats = {"ObjectType": 0, "LinkType": 0, "ActionType": 0,
             "ObjectInstance": 0, "LinkInstance": 0, "AgentConfig": 0}
    if not DATA_DIR.exists():
        print(f"[donglin] ⚠ data dir not found: {DATA_DIR}")
        return stats

    print(f"[donglin] seeding from {DATA_DIR}")
    with Session(engine) as s:

        # ---- 1. ObjectTypes ----
        existing_ot = {ot.code for ot in s.exec(select(ObjectType))}
        ots = _load("object_types.json") or []
        for spec in ots:
            clean = _strip_meta(spec)
            if clean["code"] in existing_ot and skip_if_exists:
                continue
            s.add(ObjectType(is_seed=True, **clean))
            stats["ObjectType"] += 1
        s.commit()

        # ---- 2. LinkTypes ----
        existing_lt = {lt.code for lt in s.exec(select(LinkType))}
        lts = _load("link_types.json") or []
        for arr in lts:
            code, name, src, tgt, card = arr
            if code in existing_lt and skip_if_exists:
                continue
            s.add(LinkType(code=code, display_name=name,
                           source_type_code=src, target_type_code=tgt,
                           cardinality=card, is_seed=True))
            stats["LinkType"] += 1
        s.commit()

        # ---- 3. ActionTypes ----
        existing_at = {at.code for at in s.exec(select(ActionType))}
        ats = _load("action_types.json") or []
        for spec in ats:
            if spec["code"] in existing_at and skip_if_exists:
                continue
            s.add(ActionType(is_seed=True, **spec))
            stats["ActionType"] += 1
        s.commit()

        # ---- 4. ObjectInstances (旧 id → 新 id 映射) ----
        # 通过 (type_code, data.code 或 display_name) 检测是否已存在
        existing_inst_keys = set()
        for o in s.exec(select(ObjectInstance)):
            data = o.data or {}
            key = f"{o.type_code}::{data.get('code') or data.get('no') or o.display_name}"
            existing_inst_keys.add(key)

        old_to_new_id: dict[int, int] = {}
        ois = _load("object_instances.json") or []
        for spec in ois:
            data = spec.get("data") or {}
            key = f"{spec['type_code']}::{data.get('code') or data.get('no') or spec['display_name']}"
            if key in existing_inst_keys and skip_if_exists:
                # 找到现有实例 id 用于链接映射
                existing = next((o for o in s.exec(select(ObjectInstance).where(
                    ObjectInstance.type_code == spec["type_code"])) if
                    (((o.data or {}).get("code") or (o.data or {}).get("no") or o.display_name)
                     == (data.get("code") or data.get("no") or spec['display_name']))), None)
                if existing:
                    old_to_new_id[spec["id"]] = existing.id
                continue
            obj = ObjectInstance(
                type_code=spec["type_code"],
                display_name=spec["display_name"],
                data=data,
            )
            s.add(obj)
            s.commit()
            s.refresh(obj)
            old_to_new_id[spec["id"]] = obj.id
            existing_inst_keys.add(key)
            stats["ObjectInstance"] += 1

        # ---- 5. LinkInstances (映射 ID) ----
        lis = _load("link_instances.json") or []
        for spec in lis:
            src_new = old_to_new_id.get(spec["source_id"])
            tgt_new = old_to_new_id.get(spec["target_id"])
            if not src_new or not tgt_new:
                continue
            s.add(LinkInstance(
                link_type_code=spec["link_type_code"],
                source_id=src_new, target_id=tgt_new,
            ))
            stats["LinkInstance"] += 1
        s.commit()

        # ---- 6. AgentConfigs ----
        existing_ag = {a.code for a in s.exec(select(AgentConfig))}
        ags = _load("agents.json") or []
        for spec in ags:
            if spec["code"] in existing_ag and skip_if_exists:
                continue
            s.add(AgentConfig(**spec))
            stats["AgentConfig"] += 1
        s.commit()

        # ---- 6.5. 补充骨架底稿（甲公司完整 442-sheet 子集的 ~40 张空底稿） ----
        # 已在 object_instances.json 的 9 张外，再加 40+ 张「未开始」的底稿，
        # 让侧栏 4 级树能体现完整的「计划 / 风险 / 执行 / 报告」结构。
        SKELETON_PAPERS = [
            # ── 计划阶段 X ──
            ("X1",  "企业基本情况"),
            ("X2",  "初步业务活动"),
            ("X3",  "工作计划"),
            ("X4",  "内控调查"),
            ("X5",  "会计政策"),
            ("X7",  "客户资料清单"),
            ("X11", "承接评价"),
            ("X13", "技术准备会议"),
            # ── 风险评估 Y ──
            ("Y1",  "了解被审单位"),
            ("Y2",  "整体内控"),
            ("Y3",  "重要性"),
            ("Y4",  "采购付款循环"),
            ("Y5",  "小型企业判断"),
            ("Y8",  "重大错报风险"),
            # ── 试算平衡 TB ──
            ("TB1", "本期资负调整前"),
            ("TB3", "期初资负"),
            # ── 资产 A（已有 A1/A6/A9/A10/A24，补充其他） ──
            ("A2",  "以公允价值计量金融资产"),
            ("A5",  "应收票据"),
            ("A8",  "预付款项"),
            ("A11", "合同资产"),
            ("A23", "投资性房地产"),
            ("A25", "在建工程"),
            ("A29", "无形资产"),
            ("A32", "长期待摊费用"),
            ("A33", "递延所得税资产"),
            # ── 负债 B（已有 B1/B6/B9，补充其他） ──
            ("B5",  "应付票据"),
            ("B7",  "预收款项"),
            ("B8",  "合同负债"),
            ("B10", "应交税费"),
            ("B11", "其他应付款"),
            ("B15", "长期借款"),
            # ── 权益 C ──
            ("C1",  "实收资本"),
            ("C2",  "资本公积"),
            # ── 损益 D（已有 D1，补充其他） ──
            ("D2",  "营业成本"),
            ("D3",  "税金及附加"),
            ("D4",  "销售费用"),
            ("D5",  "管理费用"),
            ("D6",  "研发费用"),
            ("D7",  "财务费用"),
            ("D15", "营业外收入"),
            ("D16", "营业外支出"),
            # ── 税务 G / H ──
            ("G",     "CIT 主表审定"),
            ("G101",  "收入审定"),
            ("G201",  "成本审定"),
            ("G400",  "期间费用审定"),
            ("G500",  "纳税调整明细"),
            ("G701",  "减免税与研发加计"),
            ("H1",    "流转税汇总"),
            # ── 报告 Z / ZK / ZS ──
            ("Z",     "封面"),
            ("Z0",    "报告签发"),
            ("Z1",    "三级复核"),
            ("Z5",    "工作总结"),
            ("Z6",    "调整分录汇总"),
            ("Z11",   "与客户交换意见"),
            ("ZK3.1", "资产负债表披露"),
            ("ZK3.2", "利润表披露"),
            ("ZK4",   "会计政策披露"),
            ("ZS10",  "管理层声明书"),
        ]
        existing_idx = {((o.data or {}).get("index"))
                        for o in s.exec(select(ObjectInstance).where(
                            ObjectInstance.type_code == "WorkingPaper"))}
        for idx, name in SKELETON_PAPERS:
            if idx in existing_idx:
                continue
            s.add(ObjectInstance(
                type_code="WorkingPaper",
                display_name=f"{idx} {name}",
                data={
                    "index": idx,
                    "name": name,
                    "template_code": "TPL-DL-FY2025",
                    "engagement_code": "ENG-JSDW-2025",
                    "sheet_data": {},
                    "review_status": "未开始",
                },
            ))
            stats["ObjectInstance"] += 1
        s.commit()

        # ---- 7. 已填底稿覆盖 (合并 sheet_data 到对应 WorkingPaper) ----
        for paper_code in ["A1", "A6", "A24", "A9", "B1"]:
            fname = f"filled_{paper_code}_workingpaper.json"
            fpath = DEMO_DIR / fname
            if not fpath.exists():
                continue
            filled = json.loads(fpath.read_text(encoding="utf-8"))
            f_idx = filled["data"]["index"]
            # 找到对应的 WorkingPaper
            wp = next((o for o in s.exec(select(ObjectInstance).where(
                ObjectInstance.type_code == "WorkingPaper"))
                if (o.data or {}).get("index") == f_idx), None)
            if wp:
                new_data = dict(wp.data or {})
                new_data.update(filled["data"])
                wp.data = new_data
                s.add(wp)
        s.commit()

        # ---- 7b. 自由底稿 A1F (freeform · 不套母版，Agent 按审计程序自拟结构) ----
        ff_path = DEMO_DIR / "filled_A1F_freeform.json"
        if ff_path.exists():
            ff = json.loads(ff_path.read_text(encoding="utf-8"))
            ff_idx = ff["data"]["index"]
            ff_exists = next((o for o in s.exec(select(ObjectInstance).where(
                ObjectInstance.type_code == "WorkingPaper"))
                if (o.data or {}).get("index") == ff_idx), None)
            if not ff_exists:
                s.add(ObjectInstance(
                    type_code="WorkingPaper",
                    display_name=ff.get("display_name", "A1 货币资金 · 自由底稿"),
                    data=ff["data"],
                ))
                stats["ObjectInstance"] += 1
            s.commit()

        # ---- 7c. 乙公司 销售循环穿行测试 (新项目 + walkthrough 底稿) ----
        wt_path = DEMO_DIR / "filled_CSG_walkthrough.json"
        if wt_path.exists():
            wt = json.loads(wt_path.read_text(encoding="utf-8"))
            eng = wt["engagement"]
            paper = wt["paper"]
            eng_code = eng["data"]["code"]
            # Engagement（按 code 幂等）
            eng_exists = next((o for o in s.exec(select(ObjectInstance).where(
                ObjectInstance.type_code == "Engagement"))
                if (o.data or {}).get("code") == eng_code), None)
            if not eng_exists:
                s.add(ObjectInstance(
                    type_code="Engagement",
                    display_name=eng.get("display_name", eng_code),
                    data=eng["data"],
                ))
                stats["ObjectInstance"] += 1
            # WorkingPaper（按 index + engagement_code 幂等）
            wt_idx = paper["data"]["index"]
            wt_exists = next((o for o in s.exec(select(ObjectInstance).where(
                ObjectInstance.type_code == "WorkingPaper"))
                if (o.data or {}).get("index") == wt_idx
                and (o.data or {}).get("engagement_code") == eng_code), None)
            if not wt_exists:
                s.add(ObjectInstance(
                    type_code="WorkingPaper",
                    display_name=paper.get("display_name", "HA7 主营业务收入穿行测试"),
                    data=paper["data"],
                ))
                stats["ObjectInstance"] += 1
            s.commit()

    # ---- 8. Anomaly 实例（Agent 实际发现的异常） ----
    try:
        from .donglin.seed_anomalies import seed_donglin_anomalies
        with Session(engine) as s:
            n_anom = seed_donglin_anomalies(s)
            stats["Anomaly"] = n_anom
    except Exception as e:
        print(f"[donglin] anomaly seed skipped: {e}")

    # ---- 9. 公共法规库 (CSA / CAS / 税法 ~30 条) + PaperTemplate 更新 ----
    try:
        from .donglin.seed_regulations import seed_regulations
        with Session(engine) as s:
            reg_stats = seed_regulations(s)
        stats["AccountingStandard"] = reg_stats.get("Standard_added", 0)
        stats["LawArticle"] = reg_stats.get("Law_added", 0)
        stats["Rules_updated"] = reg_stats.get("Rule_updated", 0)
    except Exception as e:
        print(f"[donglin] regulations seed skipped: {e}")

    # ---- 10. 审计方法/算法库 (10 个核心 AuditMethod 实例) ----
    try:
        from .donglin.seed_methods import seed_audit_methods
        with Session(engine) as s:
            m_stats = seed_audit_methods(s)
        stats["AuditMethod"] = m_stats.get("Method_added", 0)
    except Exception as e:
        print(f"[donglin] methods seed skipped: {e}")

    print(f"[donglin] seeded: " + " / ".join(f"{k}={v}" for k, v in stats.items()))
    return stats


if __name__ == "__main__":
    from .db import init_db
    init_db()
    seed_donglin()
