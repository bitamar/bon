#!/bin/bash
set -euo pipefail

# Only run in remote (web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# ── Start PostgreSQL 16 ──
# The API test suite (api/tests/setup.ts) falls back to
# postgres://postgres:postgres@localhost:5432/postgres
# when neither TEST_PG_ADMIN_URL nor Docker is available.

if command -v pg_isready &>/dev/null; then
  if ! pg_isready -q 2>/dev/null; then
    sudo pg_ctlcluster 16 main start 2>/dev/null || true
  fi

  # Set the postgres password to match the test setup expectation
  sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" 2>/dev/null || true
fi

# ── Install npm dependencies ──
cd "$CLAUDE_PROJECT_DIR"
npm install
