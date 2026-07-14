#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# Betfluencer e2e regression runner — the merge gate.
#
# One copy-pasteable command for new devs:
#
#     npm run test:e2e
#
# What it does (all idempotent, safe to re-run):
#   1. Boots local Supabase (dockerized Postgres + PostgREST + GoTrue Auth).
#   2. Applies the schema with `supabase db reset --no-seed`.
#   3. Exports the LOCAL Supabase keys (legacy JWT anon + service_role) and
#      forces ioTec into DEMO mode (no real money) + a known worker secret.
#   4. Starts the Next.js app against that local stack (dev server by default;
#      set E2E_BUILD=1 for a production build).
#   5. Waits for the app, then runs Playwright.
#
# Prerequisites: Docker running, Supabase CLI installed, and
#   `npx playwright install chromium` done once.
#
# Pass extra args straight through to playwright, e.g.:
#   npm run test:e2e -- tests/e2e/01-home.spec.ts --headed
# ──────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${E2E_PORT:-3000}"
BASE_URL="http://localhost:${PORT}"
APP_LOG="$ROOT/.e2e-app.log"
APP_PID=""

log() { printf '\033[1;36m[e2e]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[e2e]\033[0m %s\n' "$*" >&2; }

cleanup() {
  if [[ -n "$APP_PID" ]] && kill -0 "$APP_PID" 2>/dev/null; then
    log "Stopping app (pid $APP_PID)…"
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  # Leave Supabase running on purpose — re-running the suite is then instant.
  # Stop it manually with: supabase stop
}
trap cleanup EXIT INT TERM

# ── 1. Supabase up (idempotent) ───────────────────────────────────────────
if ! command -v supabase >/dev/null 2>&1; then
  err "Supabase CLI not found. Install: https://supabase.com/docs/guides/cli"
  exit 1
fi

if supabase status >/dev/null 2>&1; then
  log "Supabase already running."
else
  log "Starting Supabase (first run pulls images — can take a few minutes)…"
  supabase start
fi

# ── 2. Apply schema ───────────────────────────────────────────────────────
log "Applying migrations (supabase db reset --no-seed)…"
supabase db reset --no-seed >/dev/null

# ── 2b. Restore API-role table grants ─────────────────────────────────────
# Newer local Supabase images (seen with CLI 2.108) apply default privileges
# that leave anon/authenticated/service_role WITHOUT select/insert/update/
# delete on migration-created tables — PostgREST then throws 42501
# "permission denied" even for the service role, failing global-setup.
# Re-grant after every reset (schema-wide, mirrors hosted defaults; RLS still
# gates rows). LOCAL ONLY — the hosted prod DB manages its own grants.
log "Re-granting API-role privileges…"
docker exec supabase_db_betfluencer psql -U postgres -d postgres -q -c "
  grant usage on schema public to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
  grant usage, select on all sequences in schema public to anon, authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;
" >/dev/null

# ── 3. Export local keys + demo/test env ──────────────────────────────────
# `supabase status -o env` prints ANON_KEY / SERVICE_ROLE_KEY (legacy JWTs the
# app's supabase-js / GoTrue auth need) + API_URL. Capture and re-export them
# under the names the app reads.
log "Reading local Supabase keys…"
STATUS_ENV="$(supabase status -o env)"
get_env() { sed -n "s/^$1=\"\(.*\)\"$/\1/p" <<<"$STATUS_ENV"; }

LOCAL_API_URL="$(get_env API_URL)"
LOCAL_ANON="$(get_env ANON_KEY)"
LOCAL_SERVICE="$(get_env SERVICE_ROLE_KEY)"

if [[ -z "$LOCAL_ANON" || -z "$LOCAL_SERVICE" || -z "$LOCAL_API_URL" ]]; then
  err "Could not parse Supabase keys from \`supabase status -o env\`."
  err "$STATUS_ENV"
  exit 1
fi

export NEXT_PUBLIC_SUPABASE_URL="$LOCAL_API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$LOCAL_ANON"
export SUPABASE_SERVICE_ROLE_KEY="$LOCAL_SERVICE"

# ioTec DEMO — no real charges; collect→Pending, status→Success, disburse→ok.
export IOTEC_CLIENT_ID="demo"
export IOTEC_CLIENT_SECRET=""
export IOTEC_WALLET_ID=""

# Keep the real bookie worker OUT of the loop. With BET_CODE_WORKER_URL unset,
# verifyAndRecord()'s worker call no-ops, so a posted coded slip simply stays
# 'pending' — exactly what the coded-slip paywall test asserts.
unset BET_CODE_WORKER_URL || true

export NEXT_PUBLIC_APP_URL="$BASE_URL"
export E2E_BASE_URL="$BASE_URL"
export PORT="$PORT"

# Auth is phone-identity signed cookies. SESSION_SECRET falls back to the
# service-role key if unset, but pin it for determinism across app+specs.
export SESSION_SECRET="${SESSION_SECRET:-e2e-session-secret}"

# Admin = a single master password (no DB seeding). The app reads
# ADMIN_PASSWORD; specs read the E2E_ADMIN_PASSWORD mirror.
export E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-e2eAdmin123!}"
export ADMIN_PASSWORD="$E2E_ADMIN_PASSWORD"

# ── 4. Start the app ──────────────────────────────────────────────────────
: > "$APP_LOG"
if [[ "${E2E_BUILD:-0}" == "1" ]]; then
  log "Building production app…"
  npm run build >>"$APP_LOG" 2>&1
  log "Starting production server on :$PORT…"
  npm run start -- -p "$PORT" >>"$APP_LOG" 2>&1 &
else
  log "Starting dev server on :$PORT…"
  npx next dev -p "$PORT" >>"$APP_LOG" 2>&1 &
fi
APP_PID=$!

# ── 5. Wait for readiness ─────────────────────────────────────────────────
log "Waiting for $BASE_URL …"
for i in $(seq 1 90); do
  if curl -sf "$BASE_URL/api/slips" >/dev/null 2>&1; then
    log "App is up."
    break
  fi
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    err "App process exited early. Last 40 log lines:"
    tail -40 "$APP_LOG" >&2 || true
    exit 1
  fi
  sleep 2
  if [[ "$i" == "90" ]]; then
    err "App did not become ready in time. Last 40 log lines:"
    tail -40 "$APP_LOG" >&2 || true
    exit 1
  fi
done

# ── 6. Run Playwright ─────────────────────────────────────────────────────
log "Running Playwright…"
npx playwright test "$@"
