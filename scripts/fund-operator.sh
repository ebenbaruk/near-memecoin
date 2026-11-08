#!/usr/bin/env bash
# Moves faucet NEAR to the testnet operator: creates throwaway accounts (10 NEAR each) and deletes
# them with the operator as beneficiary. Usage: scripts/fund-operator.sh <operator> [rounds]
set -u
OPERATOR="${1:?operator account}"
ROUNDS="${2:-5}"
CREDS="$HOME/.near-credentials/testnet"
for i in $(seq 1 "$ROUNDS"); do
  ID="acrfund$(date +%s)$i.testnet"
  if ! near account create-account sponsor-by-faucet-service "$ID" autogenerate-new-keypair \
      save-to-legacy-keychain network-config testnet create >/dev/null 2>&1; then
    echo "round $i: faucet refused, stopping (it rate-limits by IP for hours)"
    rm -rf "${CREDS:?}/$ID.json" "${CREDS:?}/$ID"
    break
  fi
  sleep 4
  if near account delete-account "$ID" beneficiary "$OPERATOR" network-config testnet \
      sign-with-legacy-keychain send >/dev/null 2>&1; then
    echo "round $i: moved 10 NEAR from $ID"
  else
    echo "round $i: delete failed for $ID"
  fi
  rm -rf "${CREDS:?}/$ID.json" "${CREDS:?}/$ID"
  sleep 3
done
near account view-account-summary "$OPERATOR" network-config testnet now 2>&1 | grep -iE "balance|native" | head -3
