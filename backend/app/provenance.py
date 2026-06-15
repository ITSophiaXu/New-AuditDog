"""Provenance + versioning helper.

Standardizes how knowledge objects (AuditRule, PaperTemplate, SpecialAuditCase, …)
declare where they came from, which bundle / version they ship in, and their
governance status. This is the foundation of the harvest loop — without provenance
on every knowledge object you can't run an FDE deployment cycle, ship public
rule bundles, or anonymize-and-promote a customer-derived case.

Stored at `ObjectInstance.data["provenance"]`. UI/serialization treat its
presence as authoritative; legacy flat fields (source / issuer / effective) on
rule data are kept for read-compatibility but new code should write here.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

Origin = Literal["base", "public", "firm", "customer-derived", "wizard"]
Status = Literal["active", "draft", "superseded", "deprecated"]


def make_provenance(
    origin: Origin,
    bundle: str | None = None,
    version: str | None = None,
    issuer: str | None = None,
    effective_from: str | None = None,
    effective_until: str | None = None,
    contributed_by: list[str] | None = None,
    anonymized_from: str | None = None,
    author: str | None = None,
    status: Status = "active",
) -> dict[str, Any]:
    """Return a canonical provenance dict.

    Fields:
    - origin: where this knowledge object came from in the deployment loop
    - bundle: 'name@version' of the knowledge package this ships in (eg
      'gov-special-audit@2025-09'). Null for ad-hoc or wizard-imported items.
    - version: semver-ish version of this individual object's content
    - issuer: authoritative source (eg 中注协, 财政部, 本所)
    - effective_from / effective_until: ISO dates
    - contributed_by: list of case_no / doc refs that informed this object
    - anonymized_from: source identifier if this was derived from a customer case
    - author: who created this entry (eg 'FDE-deploy-2026-05', 'intake-wizard')
    - status: governance state (active means it can be applied to live work)
    """
    now = datetime.utcnow().isoformat()
    return {
        "origin": origin,
        "bundle": bundle,
        "version": version,
        "issuer": issuer,
        "effective_from": effective_from,
        "effective_until": effective_until,
        "contributed_by": contributed_by or [],
        "anonymized_from": anonymized_from,
        "author": author,
        "status": status,
        "created_at": now,
        "updated_at": now,
    }


# ---------- Bundle registry ----------
# Conventional bundles shipped with the prototype. Real deployments would
# load these from a separate bundle catalog table or a marketplace API.

BUNDLE_REGISTRY: dict[str, dict[str, Any]] = {
    "audit-base@2025-Q4": {
        "name": "审计基础规则库",
        "description": "中注协 注册会计师审计准则要点 + 本所标准化复核要求。",
        "issuer": "中注协",
        "version": "2025-Q4",
        "scope": ["货币资金", "收入", "关联交易"],
    },
    "gov-special-audit@2025-09": {
        "name": "政府专项审计包",
        "description": "财政部专项资金管理办法 + 政府采购合规 + 绩效审计要点。",
        "issuer": "财政部",
        "version": "2025-09",
        "scope": ["政府专项"],
    },
    "firm-internal@2025-Q1": {
        "name": "本所内规库",
        "description": "事务所内部复核标准、签字流程、重大事项上报机制。",
        "issuer": "本所",
        "version": "2025-Q1",
        "scope": ["复核标准"],
    },
    "audit-base-templates@2025-Q4": {
        "name": "标准底稿模板库",
        "description": "货币资金、应收账款、收入等通用底稿模板。",
        "issuer": "本所标准化",
        "version": "2025-Q4",
        "scope": ["底稿模板"],
    },
    "firm-cases@2024": {
        "name": "本所历史案例集",
        "description": "已完成、已脱敏的专项审计案例 — 供新项目参考。",
        "issuer": "本所归档",
        "version": "2024",
        "scope": ["案例库"],
    },
}


# Prefix → bundle lookup for AuditRule codes.
_RULE_BUNDLE_BY_PREFIX: dict[str, tuple[str, str, Origin, str, str]] = {
    # prefix:  (bundle_id, version, origin, issuer, effective_from)
    "CASH": ("audit-base@2025-Q4", "2025-Q4.1", "public", "中注协", "2023-12-01"),
    "REV":  ("audit-base@2025-Q4", "2025-Q4.1", "public", "中注协", "2023-12-01"),
    "RPT":  ("audit-base@2025-Q4", "2025-Q4.1", "public", "中注协", "2024-01-01"),
    "GOV":  ("gov-special-audit@2025-09", "2025-09.2", "public", "财政部", "2024-01-01"),
    "FIRM": ("firm-internal@2025-Q1", "1.0.0", "firm", "本所", "2025-01-01"),
}


def provenance_for_rule(code: str) -> dict[str, Any]:
    """Decorate a rule by its code prefix (eg 'GOV-RULE-001' → gov bundle)."""
    prefix = code.split("-", 1)[0] if "-" in code else code
    spec = _RULE_BUNDLE_BY_PREFIX.get(prefix)
    if not spec:
        return make_provenance(
            origin="firm", bundle="firm-custom@latest", version="0.1.0",
            issuer="本所", effective_from="2025-01-01", status="active",
        )
    bundle, version, origin, issuer, effective = spec
    return make_provenance(
        origin=origin, bundle=bundle, version=version,
        issuer=issuer, effective_from=effective, status="active",
    )


# Prefix → bundle lookup for PaperTemplate codes.
_TEMPLATE_BUNDLE_BY_PREFIX: dict[str, tuple[str, str, Origin, str]] = {
    "TPL-CASH": ("audit-base-templates@2025-Q4", "2025-Q4.1", "base", "本所标准化"),
    "TPL-AR":   ("audit-base-templates@2025-Q4", "2025-Q4.1", "base", "本所标准化"),
    "TPL-REV":  ("audit-base-templates@2025-Q4", "2025-Q4.1", "base", "本所标准化"),
    "TPL-GOV":  ("gov-special-audit@2025-09",    "2025-09.2", "public", "财政部"),
}


def provenance_for_template(code: str) -> dict[str, Any]:
    for prefix, spec in _TEMPLATE_BUNDLE_BY_PREFIX.items():
        if code.startswith(prefix):
            bundle, version, origin, issuer = spec
            return make_provenance(
                origin=origin, bundle=bundle, version=version,
                issuer=issuer, effective_from="2025-01-01", status="active",
            )
    return make_provenance(
        origin="firm", bundle="firm-templates@latest", version="0.1.0",
        issuer="本所", effective_from="2025-01-01", status="active",
    )
