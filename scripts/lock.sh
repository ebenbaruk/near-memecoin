#!/usr/bin/env bash
# IRREVERSIBLE. Deletes every access key of a contract account, then checks that none is left.
# Usage: scripts/lock.sh <account> --yes
set -euo pipefail
ACCOUNT="${1:?account}"; [ "${2:-}" = "--yes" ] || { echo "refusing without --yes: this cannot be undone"; exit 2; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; LOG="$ROOT/var/lock-$ACCOUNT.log"; mkdir -p "$ROOT/var"
keys() {
  local answer
  answer="$(curl -fsS https://test.rpc.fastnear.com -H 'content-type: application/json' -d \
    "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key_list\",\"finality\":\"final\",\"account_id\":\"$ACCOUNT\"}}")"
  # An empty or error answer must never read as "no keys left".
  jq -e '.result.keys | type == "array"' >/dev/null <<<"$answer" || { echo "unusable RPC answer for $ACCOUNT" >&2; return 1; }
  jq -r '.result.keys[].public_key' <<<"$answer"
}
ALL="$(keys)"
for KEY in $ALL; do
  near account delete-keys "$ACCOUNT" public-keys "$KEY" network-config testnet sign-with-legacy-keychain send >>"$LOG" 2>&1
  sleep 3
done
sleep 5
LEFT="$(keys | wc -l)"; grep -iE "Transaction ID" "$LOG" | sort -u
echo "$ACCOUNT: $LEFT access keys left"; [ "$LEFT" = 0 ]
