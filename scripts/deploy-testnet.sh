#!/usr/bin/env bash
# Deploys, verifies and seeds Standby on Whitechain Sepolia (chain 1874) with the official test USDT.
# Reads keys from .env (never printed). Prints addresses, balances and explorer links only.
# Steps: preflight balances -> Deploy.s.sol (+ Blockscout verification) -> write addresses to .env
#        -> Seed.s.sol -> export ABIs. Re-run with SKIP_DEPLOY=1 to seed an existing deployment.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
ENV_FILE="$ROOT/.env"
[[ -f "$ENV_FILE" ]] || { echo "No .env: cp .env.example .env && ./scripts/new-wallets.sh"; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

RPC=${WC_RPC_URL:-https://rpc.testnet.whitechain.io}
EXPLORER=https://explorer.testnet.whitechain.io
USDT=${USDT_ADDRESS:-0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7}
chain=$(cast chain-id --rpc-url "$RPC")
[[ "$chain" == "1874" ]] || { echo "RPC $RPC is chain $chain, expected 1874"; exit 1; }

decimals=$(cast call "$USDT" 'decimals()(uint8)' --rpc-url "$RPC")
echo "chain 1874, USDT decimals $decimals"
short=0
for role in DEPLOYER LENDER BUYER1 BUYER2 BORROWER KEEPER; do
  var="${role}_PK"
  [[ -n "${!var:-}" ]] || { echo "$var missing in .env"; exit 1; }
  addr=$(cast wallet address --private-key "${!var}")
  wbt=$(cast balance "$addr" --rpc-url "$RPC" --ether)
  usdt=$(cast call "$USDT" 'balanceOf(address)(uint256)' "$addr" --rpc-url "$RPC" | awk '{print $1}')
  echo "$role $addr  WBT $wbt  USDT $(cast from-wei "$usdt" "$((decimals == 18 ? 18 : 0))" 2>/dev/null || echo "$usdt") (base units $usdt)"
  if [[ "$wbt" == "0.000000000000000000" || "$wbt" == "0" ]]; then echo "  needs WBT for gas"; short=1; fi
done
[[ $short == 0 ]] || { echo "Fund the wallets above with WBT (faucet: https://faucet.testnet.whitechain.io), then re-run."; exit 1; }

cd "$ROOT/contracts"
if [[ "${SKIP_DEPLOY:-0}" != "1" ]]; then
  export USDT_ADDRESS=$USDT
  forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --slow \
    --verify --verifier blockscout --verifier-url "$EXPLORER/api/" -q
fi

D="$ROOT/packages/shared/src/deployments.json"
declare -A VAR=([AllowlistRegistry]=REGISTRY_ADDRESS [RestrictedAsset]=ASSET_ADDRESS [NavOracle]=ORACLE_ADDRESS \
  [BidBook]=BIDBOOK_ADDRESS [StandbyMarket]=MARKET_ADDRESS)
for name in AllowlistRegistry RestrictedAsset NavOracle BidBook StandbyMarket; do
  addr=$(jq -r ".contracts.$name" "$D")
  v=${VAR[$name]}
  export "$v=$addr"
  if grep -q "^$v=" "$ENV_FILE"; then sed -i.bak "s|^$v=.*|$v=$addr|" "$ENV_FILE"; else echo "$v=$addr" >>"$ENV_FILE"; fi
  echo "$name $EXPLORER/address/$addr"
done
rm -f "$ENV_FILE.bak"

forge script script/Seed.s.sol --rpc-url "$RPC" --broadcast --slow
node "$ROOT/scripts/export-abi.mjs"
echo "Done. Commit packages/shared/src/deployments.json and record the links in docs/plan.md."
