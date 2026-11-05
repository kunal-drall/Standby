#!/usr/bin/env bash
# Local rehearsal of the testnet demo. Starts an anvil fork of Whitechain Sepolia (chain 1874, so the
# official test USDT contract is present), gives six anvil dev wallets test USDT, deploys and seeds
# Standby, and writes:
#   .local/env          keeper / script env (keys and addresses, never committed)
#   .local/deployments.json
#   web/.env.local      VITE_* settings for the web app
# Uses anvil's public development mnemonic. Those keys are public: local use only.
# Usage: ./scripts/local-chain.sh [--fresh]   (--fresh stops a running node first)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
FORK_RPC=${FORK_RPC_URL:-https://rpc.testnet.whitechain.io}
PORT=${ANVIL_PORT:-8545}
LOCAL=http://127.0.0.1:$PORT
USDT=0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7
MNEMONIC="test test test test test test test test test test test junk"
mkdir -p "$ROOT/.local"

if [[ "${1:-}" == "--fresh" && -f "$ROOT/.local/anvil.pid" ]]; then
  kill "$(cat "$ROOT/.local/anvil.pid")" 2>/dev/null || true
  rm -f "$ROOT/.local/anvil.pid"
  sleep 1
fi

if ! cast chain-id --rpc-url "$LOCAL" >/dev/null 2>&1; then
  nohup anvil --fork-url "$FORK_RPC" --chain-id 1874 --port "$PORT" --block-time 1 \
    >"$ROOT/.local/anvil.log" 2>&1 &
  echo $! >"$ROOT/.local/anvil.pid"
  for _ in $(seq 1 60); do
    cast chain-id --rpc-url "$LOCAL" >/dev/null 2>&1 && break
    sleep 1
  done
fi
echo "anvil fork on $LOCAL (chain $(cast chain-id --rpc-url "$LOCAL"))"

roles=(DEPLOYER LENDER BUYER1 BUYER2 BORROWER KEEPER)
declare -A PK ADDR
for i in "${!roles[@]}"; do
  r=${roles[$i]}
  PK[$r]=$(cast wallet private-key "$MNEMONIC" "$i")
  ADDR[$r]=$(cast wallet address --private-key "${PK[$r]}")
done

decimals=$(cast call "$USDT" 'decimals()(uint8)' --rpc-url "$LOCAL")
unit=$((10 ** decimals))
# The test USDT is an upgradeable OpenZeppelin v4 ERC-20 whose balances mapping sits at slot 51
# (found by probing on the fork). Write each balance there and check it with balanceOf.
SLOT=${USDT_BALANCE_SLOT:-51}
for r in LENDER BUYER1 BUYER2 BORROWER; do
  key=$(cast index address "${ADDR[$r]}" "$SLOT")
  cast rpc anvil_setStorageAt "$USDT" "$key" "$(cast to-uint256 $((5000 * unit)))" --rpc-url "$LOCAL" >/dev/null
  bal=$(cast call "$USDT" 'balanceOf(address)(uint256)' "${ADDR[$r]}" --rpc-url "$LOCAL" | awk '{print $1}')
  [[ "$bal" == "$((5000 * unit))" ]] || { echo "could not set USDT balance for $r (slot $SLOT)"; exit 1; }
done
echo "USDT decimals $decimals; 5,000 USDT dealt to lender, buyers and borrower"

export USDT_ADDRESS=$USDT DEPLOYER_PK=${PK[DEPLOYER]} LENDER_PK=${PK[LENDER]} BUYER1_PK=${PK[BUYER1]} \
  BUYER2_PK=${PK[BUYER2]} BORROWER_PK=${PK[BORROWER]} KEEPER_PK=${PK[KEEPER]}
export DEPLOYMENTS_OUT=../.local/deployments.json

cd "$ROOT/contracts"
forge script script/Deploy.s.sol --rpc-url "$LOCAL" --broadcast --slow -q >/dev/null
D="$ROOT/.local/deployments.json"
export REGISTRY_ADDRESS=$(jq -r .contracts.AllowlistRegistry "$D")
export ASSET_ADDRESS=$(jq -r .contracts.RestrictedAsset "$D")
export ORACLE_ADDRESS=$(jq -r .contracts.NavOracle "$D")
export BIDBOOK_ADDRESS=$(jq -r .contracts.BidBook "$D")
export MARKET_ADDRESS=$(jq -r .contracts.StandbyMarket "$D")
START_BLOCK=$(jq -r .startBlock "$D")
forge script script/Seed.s.sol --rpc-url "$LOCAL" --broadcast --slow -q >/dev/null
echo "deployed and seeded; market $MARKET_ADDRESS"

cat >"$ROOT/.local/env" <<EOF
WC_RPC_URL=$LOCAL
WC_CHAIN_ID=1874
USDT_ADDRESS=$USDT
DEPLOYER_PK=$DEPLOYER_PK
LENDER_PK=$LENDER_PK
BUYER1_PK=$BUYER1_PK
BUYER2_PK=$BUYER2_PK
BORROWER_PK=$BORROWER_PK
KEEPER_PK=$KEEPER_PK
REGISTRY_ADDRESS=$REGISTRY_ADDRESS
ASSET_ADDRESS=$ASSET_ADDRESS
ORACLE_ADDRESS=$ORACLE_ADDRESS
BIDBOOK_ADDRESS=$BIDBOOK_ADDRESS
MARKET_ADDRESS=$MARKET_ADDRESS
START_BLOCK=$START_BLOCK
EOF

cat >"$ROOT/web/.env.local" <<EOF
VITE_RPC_URL=$LOCAL
VITE_USDT_ADDRESS=$USDT
VITE_REGISTRY_ADDRESS=$REGISTRY_ADDRESS
VITE_ASSET_ADDRESS=$ASSET_ADDRESS
VITE_ORACLE_ADDRESS=$ORACLE_ADDRESS
VITE_BIDBOOK_ADDRESS=$BIDBOOK_ADDRESS
VITE_MARKET_ADDRESS=$MARKET_ADDRESS
VITE_START_BLOCK=$START_BLOCK
VITE_ISSUER_PK=$DEPLOYER_PK
VITE_LENDER_PK=$LENDER_PK
VITE_BUYER1_PK=$BUYER1_PK
VITE_BUYER2_PK=$BUYER2_PK
VITE_BORROWER_PK=$BORROWER_PK
EOF
echo "wrote .local/env and web/.env.local"
