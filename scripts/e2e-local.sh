#!/usr/bin/env bash
# End-to-end run on a fresh local fork: deploy and seed (scripts/local-chain.sh --fresh), start the
# keeper, run the Playwright tests in web/e2e, stop the keeper. Exit code is Playwright's.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
"$ROOT/scripts/local-chain.sh" --fresh
pnpm -C "$ROOT/packages/shared" build >/dev/null
pnpm -C "$ROOT/keeper" build >/dev/null
[[ -f "$ROOT/.local/keeper.pid" ]] && kill "$(cat "$ROOT/.local/keeper.pid")" 2>/dev/null || true
(
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.local/env"
  set +a
  POLL_INTERVAL_MS=2000 PORT=${KEEPER_PORT:-8788} exec node "$ROOT/keeper/dist/index.js"
) >"$ROOT/.local/keeper.log" 2>&1 &
echo $! >"$ROOT/.local/keeper.pid"
trap 'kill "$(cat "$ROOT/.local/keeper.pid")" 2>/dev/null || true' EXIT
status=0
pnpm -C "$ROOT/web" exec playwright test "$@" || status=$?
echo "keeper log: .local/keeper.log"
grep -E '"event":"settled"' "$ROOT/.local/keeper.log" || true
exit $status
