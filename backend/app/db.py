import json
from datetime import datetime, date
from pathlib import Path
from sqlmodel import SQLModel, Session, create_engine

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "audit_ontology.db"


def _json_default(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def _json_serializer(value):
    return json.dumps(value, ensure_ascii=False, default=_json_default)


engine = create_engine(
    f"sqlite:///{DB_PATH}",
    echo=False,
    connect_args={"check_same_thread": False},
    json_serializer=_json_serializer,
)


def init_db() -> None:
    from . import models  # noqa: F401 — ensure tables are registered
    SQLModel.metadata.create_all(engine)
    # Add new MCPServer columns for existing DBs (safe no-op if already present)
    _migrate_mcp_server_columns()


def _migrate_mcp_server_columns() -> None:
    """Add url/headers columns to mcp_servers if they don't exist yet."""
    try:
        with engine.connect() as conn:
            from sqlalchemy import text
            # Check existing columns
            rows = conn.execute(text("PRAGMA table_info(mcp_servers)")).fetchall()
            existing = {r[1] for r in rows}
            if "url" not in existing:
                conn.execute(text("ALTER TABLE mcp_servers ADD COLUMN url TEXT NOT NULL DEFAULT ''"))
                conn.commit()
            if "headers" not in existing:
                conn.execute(text("ALTER TABLE mcp_servers ADD COLUMN headers JSON"))
                conn.commit()
    except Exception:
        pass  # Table doesn't exist yet — create_all will handle it


def get_session():
    with Session(engine) as session:
        yield session
