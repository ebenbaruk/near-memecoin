#!/usr/bin/env bash
# Creates a testnet account funded by the operator, then deploys the committed wasm and calls `new`
# in one transaction. Usage: scripts/deploy.sh <account> <init.json> <near-amount> [operator]
set -euo pipefail
ACCOUNT="${1:?account}"; INIT="${2:?init json}"; AMOUNT="${3:?near amount}"; OPERATOR="${4:-acr-ops.testnet}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; WASM="$ROOT/contracts/anyone-can-rug/res/anyone_can_rug.wasm"
(cd "$ROOT" && sha256sum -c contracts/anyone-can-rug/res/anyone_can_rug.wasm.sha256 --quiet)
LOG="$ROOT/var/deploy-$ACCOUNT.log"; mkdir -p "$ROOT/var"
near account create-account fund-myself "$ACCOUNT" "$AMOUNT NEAR" autogenerate-new-keypair \
  save-to-legacy-keychain sign-as "$OPERATOR" network-config testnet sign-with-legacy-keychain send >"$LOG" 2>&1 \
  || { grep -iE "error|fail" "$LOG" | head -5; exit 1; }
sleep 3
near contract deploy "$ACCOUNT" use-file "$WASM" with-init-call new file-args "$INIT" \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send >>"$LOG" 2>&1 \
  || { grep -iE "error|fail" "$LOG" | head -5; exit 1; }
grep -iE "Transaction ID|explorer|testnet.nearblocks" "$LOG" | sort -u
