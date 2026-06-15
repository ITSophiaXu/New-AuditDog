"""Ontology CRUD + instance/link/action endpoints.

The endpoints are intentionally generic — the audit domain is just seeded data
on top of these tables. The frontend uses the same endpoints whether it's
showing the seeded 底稿 type or a user-created type.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import (
    ObjectType, LinkType, ActionType,
    ObjectInstance, LinkInstance,
)
from ..schemas import ObjectTypeIn, LinkTypeIn, ActionTypeIn, ObjectInstanceIn

router = APIRouter()


# ---------- Object types ----------

@router.get("/object-types")
def list_object_types(s: Session = Depends(get_session)) -> list[ObjectType]:
    return list(s.exec(select(ObjectType).order_by(ObjectType.id)))


@router.get("/object-types/{code}")
def get_object_type(code: str, s: Session = Depends(get_session)) -> ObjectType:
    ot = s.exec(select(ObjectType).where(ObjectType.code == code)).first()
    if not ot:
        raise HTTPException(404, f"object type {code} not found")
    return ot


@router.post("/object-types")
def create_object_type(body: ObjectTypeIn, s: Session = Depends(get_session)) -> ObjectType:
    if s.exec(select(ObjectType).where(ObjectType.code == body.code)).first():
        raise HTTPException(400, "code already exists")
    ot = ObjectType(
        code=body.code,
        display_name=body.display_name,
        description=body.description,
        icon=body.icon,
        color=body.color,
        properties_schema=[p.model_dump() for p in body.properties_schema],
    )
    s.add(ot); s.commit(); s.refresh(ot)
    return ot


@router.put("/object-types/{code}")
def update_object_type(code: str, body: ObjectTypeIn, s: Session = Depends(get_session)) -> ObjectType:
    ot = s.exec(select(ObjectType).where(ObjectType.code == code)).first()
    if not ot:
        raise HTTPException(404, "not found")
    ot.display_name = body.display_name
    ot.description = body.description
    ot.icon = body.icon
    ot.color = body.color
    ot.properties_schema = [p.model_dump() for p in body.properties_schema]
    s.add(ot); s.commit(); s.refresh(ot)
    return ot


# ---------- Link types ----------

@router.get("/link-types")
def list_link_types(s: Session = Depends(get_session)) -> list[LinkType]:
    return list(s.exec(select(LinkType).order_by(LinkType.id)))


@router.post("/link-types")
def create_link_type(body: LinkTypeIn, s: Session = Depends(get_session)) -> LinkType:
    lt = LinkType(**body.model_dump())
    s.add(lt); s.commit(); s.refresh(lt)
    return lt


# ---------- Action types ----------

@router.get("/action-types")
def list_action_types(s: Session = Depends(get_session)) -> list[ActionType]:
    return list(s.exec(select(ActionType).order_by(ActionType.id)))


@router.post("/action-types")
def create_action_type(body: ActionTypeIn, s: Session = Depends(get_session)) -> ActionType:
    at = ActionType(
        code=body.code,
        display_name=body.display_name,
        description=body.description,
        target_type_code=body.target_type_code,
        kind=body.kind,
        parameters_schema=[p.model_dump() for p in body.parameters_schema],
    )
    s.add(at); s.commit(); s.refresh(at)
    return at


# ---------- Object instances ----------

@router.get("/objects")
def list_objects(
    type_code: str | None = None,
    s: Session = Depends(get_session),
) -> list[ObjectInstance]:
    q = select(ObjectInstance)
    if type_code:
        q = q.where(ObjectInstance.type_code == type_code)
    return list(s.exec(q.order_by(ObjectInstance.id)))


@router.get("/objects/{obj_id}")
def get_object(obj_id: int, s: Session = Depends(get_session)) -> dict[str, Any]:
    obj = s.get(ObjectInstance, obj_id)
    if not obj:
        raise HTTPException(404, "not found")
    out_links = list(s.exec(select(LinkInstance).where(LinkInstance.source_id == obj_id)))
    in_links = list(s.exec(select(LinkInstance).where(LinkInstance.target_id == obj_id)))
    return {
        "object": obj,
        "out_links": [l.model_dump() for l in out_links],
        "in_links": [l.model_dump() for l in in_links],
    }


@router.post("/objects")
def create_object(body: ObjectInstanceIn, s: Session = Depends(get_session)) -> ObjectInstance:
    obj = ObjectInstance(
        type_code=body.type_code,
        display_name=body.display_name,
        data=body.data,
    )
    s.add(obj); s.commit(); s.refresh(obj)
    return obj


@router.patch("/objects/{obj_id}")
def patch_object(obj_id: int, body: dict[str, Any], s: Session = Depends(get_session)) -> ObjectInstance:
    obj = s.get(ObjectInstance, obj_id)
    if not obj:
        raise HTTPException(404, "not found")
    new_data = dict(obj.data or {})
    if "data" in body and isinstance(body["data"], dict):
        new_data.update(body["data"])
        obj.data = new_data
    if "display_name" in body:
        obj.display_name = body["display_name"]
    obj.updated_at = datetime.utcnow()
    s.add(obj); s.commit(); s.refresh(obj)
    return obj


# ---------- Action execution (generic dispatch) ----------

@router.post("/actions/{code}/execute")
def execute_action(code: str, body: dict[str, Any], s: Session = Depends(get_session)) -> dict[str, Any]:
    """Apply an action to a target object. Used by the Workbench UI for manual edits;
    agents also dispatch through here via the runner."""
    at = s.exec(select(ActionType).where(ActionType.code == code)).first()
    if not at:
        raise HTTPException(404, "action type not found")
    target_id = body.get("target_id")
    params = body.get("parameters") or {}
    obj = s.get(ObjectInstance, target_id) if target_id else None
    if not obj:
        raise HTTPException(400, "target_id required and must reference an existing object")

    if at.kind == "fill":
        merged = dict(obj.data or {})
        merged.update(params.get("fields") or {})
        obj.data = merged
        obj.updated_at = datetime.utcnow()
        s.add(obj); s.commit(); s.refresh(obj)
        return {"ok": True, "target": obj}

    if at.kind == "flag":
        anomaly = ObjectInstance(
            type_code="Anomaly",
            display_name=params.get("detail", "异常"),
            data={
                "rule_code": params.get("rule_code"),
                "paper_id": target_id,
                "detail": params.get("detail"),
                "severity": params.get("severity", "medium"),
                "status": "open",
            },
        )
        s.add(anomaly); s.commit(); s.refresh(anomaly)
        link = LinkInstance(link_type_code="AnomalyOnPaper", source_id=anomaly.id, target_id=target_id)
        s.add(link); s.commit()
        return {"ok": True, "anomaly_id": anomaly.id}

    if at.kind == "apply_rule":
        rule_code = params.get("rule_code")
        rule = s.exec(select(ObjectInstance).where(
            ObjectInstance.type_code == "AuditRule",
        )).all()
        rule_obj = next((r for r in rule if (r.data or {}).get("code") == rule_code), None)
        passed = True
        finding = ""
        if rule_obj:
            expr = (rule_obj.data or {}).get("expression", "")
            # naive: every seeded rule passes in v1; this is where rule eval would live
            passed = True
            finding = f"规则 {rule_code} 已应用：{expr or '(无表达式)'}"
        return {"ok": True, "passed": passed, "finding": finding}

    raise HTTPException(400, f"unsupported action kind {at.kind}")
