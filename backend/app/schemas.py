"""Pydantic request/response schemas. Keep them thin — most reads return ORM models directly."""
from __future__ import annotations

from typing import Any
from pydantic import BaseModel


class PropertyDef(BaseModel):
    code: str
    label: str
    type: str = "string"          # string | number | enum | json | text | date | money
    required: bool = False
    default: Any | None = None
    enum: list[str] | None = None
    help: str | None = None


class ObjectTypeIn(BaseModel):
    code: str
    display_name: str
    description: str = ""
    icon: str = "Cube"
    color: str = "#6366f1"
    properties_schema: list[PropertyDef] = []


class LinkTypeIn(BaseModel):
    code: str
    display_name: str
    source_type_code: str
    target_type_code: str
    cardinality: str = "many"
    description: str = ""


class ActionTypeIn(BaseModel):
    code: str
    display_name: str
    description: str = ""
    target_type_code: str
    kind: str
    parameters_schema: list[PropertyDef] = []


class ObjectInstanceIn(BaseModel):
    type_code: str
    display_name: str = ""
    data: dict[str, Any] = {}


class AgentConfigIn(BaseModel):
    code: str
    name: str
    description: str = ""
    scenario: str = "working_paper_fill"
    avatar: str = "Bot"
    system_prompt: str = ""
    tools: list[dict[str, Any]] = []
    retrieval_object_types: list[str] = []


class ChatRequest(BaseModel):
    message: str
    agent_code: str | None = None
    paper_id: int | None = None


# ---------- Correction loop ----------

class CorrectionIn(BaseModel):
    paper_id: int
    field_path: str
    old_value: Any | None = None
    new_value: Any | None = None
    reason_code: str = "other"
    reason_text: str = ""
    agent_run_id: int | None = None
    user: str = "anonymous"
    # if true, also patches the underlying paper sheet_data with new_value
    apply_to_paper: bool = True


class ProposeDeltaResponse(BaseModel):
    has_proposal: bool
    kind: str = ""                  # template_field_source | rule_exception | ...
    summary: str = ""               # 中文 explainer ("应该取 1002+1012")
    target_kind: str = ""
    target_code: str = ""
    delta: dict[str, Any] = {}
    scope_options: list[dict[str, Any]] = []   # [{value, label, affected_count, warning?}]
    affected_papers: list[dict[str, Any]] = []  # preview rows


class ApplyChangeIn(BaseModel):
    correction_id: int | None = None
    kind: str
    target_kind: str
    target_code: str
    scope: str = "paper"           # paper | template | firm
    paper_id: int | None = None
    delta: dict[str, Any] = {}
    summary: str = ""
    applied_by: str = "anonymous"


# ---------- Template upload (Excel) ----------

class TemplateInferIn(BaseModel):
    # Either upload via multipart OR pass cell rows directly (frontend can parse with SheetJS).
    sheet_name: str = ""
    rows: list[list[Any]] = []     # raw 2D cell array
    filename: str = ""


# ---------- NL rule compile + preview ----------

class RuleCompileIn(BaseModel):
    description: str               # 中文 NL rule
    scope_template_code: str | None = None     # restrict to one template if set
    severity: str = "medium"


class RuleRefineIn(BaseModel):
    description: str
    compiled: dict[str, Any]       # the previously compiled rule
    false_positives: list[dict[str, Any]] = []   # rows the user said "not actually an anomaly"


class RuleSaveIn(BaseModel):
    compiled: dict[str, Any]
    scope_template_code: str | None = None
    run_on_existing: bool = False


# ---------- Agent fork ----------

class AgentForkIn(BaseModel):
    source_code: str               # the agent to fork
    new_code: str
    new_name: str
    change_description: str = ""   # NL — "甲公司有外币账户, 要额外比汇率"


class AgentEditPreviewIn(BaseModel):
    base_code: str
    change_description: str
