#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

(cd "$ROOT/backend" && \
  if [ ! -d .venv ]; then python -m venv .venv; fi && \
  .venv/bin/python -m pip install -q -r requirements.txt && \
  .venv/bin/uvicorn app.main:app --reload --port 8000) &
BACK=$!

(cd "$ROOT/frontend" && \
  if [ ! -d node_modules ]; then npm install; fi && \
  npm run dev) &
FRONT=$!

trap "kill $BACK $FRONT 2>/dev/null" EXIT
wait
