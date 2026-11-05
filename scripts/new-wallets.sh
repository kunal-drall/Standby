#!/usr/bin/env bash
# Creates fresh testnet wallets and writes them to .env without printing private keys.
# Prints only "<ROLE> <address>". Needs Foundry (cast) and jq.
set -euo pipefail
ENV_FILE="${1:-.env}"
touch "$ENV_FILE"
for name in DEPLOYER LENDER BUYER1 BUYER2 BORROWER KEEPER; do
  if grep -q "^${name}_PK=0x" "$ENV_FILE"; then
    echo "${name} already set"
    continue
  fi
  json=$(cast wallet new --json)
  pk=$(echo "$json" | jq -er '.[0].private_key') || { echo "Unexpected cast output; nothing written for ${name}"; exit 1; }
  addr=$(echo "$json" | jq -er '.[0].address')
  if grep -q "^${name}_PK=" "$ENV_FILE"; then
    sed -i.bak "s|^${name}_PK=.*|${name}_PK=${pk}|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  else
    echo "${name}_PK=${pk}" >> "$ENV_FILE"
  fi
  echo "${name} ${addr}"
done
