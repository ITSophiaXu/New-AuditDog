"""MCP server registry — register external MCP servers and expose their tools to agents.

For v1 we don't actually launch MCP servers (the tool execution is stubbed in the
runner). The registry's job is to make the connection story tangible in the UI:
auditors see a catalog of MCP integrations, can enable/disable them, and the agent
studio can attach their tools to an agent config.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from .db import get_session
from .models import MCPServer

router = APIRouter()


@router.get("/mcp/servers")
def list_servers(s: Session = Depends(get_session)) -> list[MCPServer]:
    return list(s.exec(select(MCPServer).order_by(MCPServer.id)))


@router.post("/mcp/servers")
def create_server(body: dict, s: Session = Depends(get_session)) -> MCPServer:
    if s.exec(select(MCPServer).where(MCPServer.name == body["name"])).first():
        raise HTTPException(400, "name already exists")
    srv = MCPServer(**body)
    s.add(srv); s.commit(); s.refresh(srv)
    return srv


@router.patch("/mcp/servers/{name}")
def update_server(name: str, body: dict, s: Session = Depends(get_session)) -> MCPServer:
    srv = s.exec(select(MCPServer).where(MCPServer.name == name)).first()
    if not srv:
        raise HTTPException(404, "not found")
    for k, v in body.items():
        if hasattr(srv, k):
            setattr(srv, k, v)
    s.add(srv); s.commit(); s.refresh(srv)
    return srv
