# 20: Contract spec, Anyone Can Rug ($RUGPRICE)

Status: build spec, 2026-11-08. Testnet only. Mainnet is out of scope (CLAUDE.md, "Never without confirmation").
Sources checked: `near-contract-standards` 5.30.1 source (read, not recalled), `near-sdk` 5.30.1 source, NEP-141/145/297 via Context7. Integer math cross-checked with a BigInt script, 400k random operations: no reserve drift, buy dust ≤ 5.3e6 yocto. That script is a model, not the Rust contract.

## 0. Changes against `05-brainstorm-wow.md` and the float model

| # | Change | Why |
|---|---|---|
| C1 | `rug` takes a third argument, `max_burn`. | **Bug.** T grows with S. Anyone can pump S just before a rug (one batch, buy then sell, 4 % cost); a holder with 10×T would then burn far more than quoted. `min_payout` does not protect tokens. |
| C2 | The Gap "buy then rug" solves the T the purchase itself raises. | **Sim bug.** `core.mjs::gapBuy` prices T at the pre-buy S. Buying moves S, so T moves. Correct size is in §6; at S=1M the float cost was understated by about 5 %. |
| C3 | One canonical rounded function `R(x)` (ceil). Buy cost and sell gross are both differences of it. | Replaces per-operation rounding: costs are path-independent, split trades gain nothing, and `reserve == R(x)` holds **exactly**. Direction is still against the user: tokens minted floor, fees ceil. |
| C4 | Burned amount is derived: `B = x − S`, not stored. | One source of truth, nothing to drift. |
| C5 | On-chain journal `get_journal`. | **Blocker.** NEAR RPC has no "get logs by contract". NEP-297 events alone need an indexer, so they do not give a "log of every mint and burn" without a backend. Each journal entry is prepaid (§8). Events are still emitted. |
| C6 | A failed payout goes to the pot and is journaled (`payout_failed`); tokens stay burned. | No claim map, nothing stuck, and replaying the journal still reproduces the pot. Only reachable by deleting your own account mid-flight. |
| C7 | `storage_unregister` **always panics**. | Unregistering in the middle of an `ft_transfer_call` makes the library burn silently, and a cheap loop drained the bootstrap and bricked trading (audit M2). Deliberate deviation from NEP-145; the README states it. |
| C8 | `yield` **dropped**, including as a cosmetic. | It is never a source of truth here (nothing needs a timeout), costs prepaid gas and needs a re-arm path. No score gain for the risk in 6 days. |
| C9 | `Tmin` from the sim dropped. | `pot_min` already blocks the empty-coin case and T > 0 whenever pot > 0 (§5). |
| C10 | `ft_resolve_transfer` is `#[private]`. | The library does no self-check: a direct call could take a victim's tokens (audit M1). |
| C11 | `a <= 1e20`; `pot_min >= rug_fee + journal_fee`; `sell` requires `payout >= journal_fee`. | `r(X_MAX)` must fit `u128`; every payout must be able to pay for its own failure entry. |
| C12 | Stable error codes (§3.1). | Shared by the page, the simulator vectors and the tests. |
| C13 | `get_gap_buy` returns the post-buy `t_required` and a real `cost`, and clamps the deposit to `min_buy`. | Small quotes used to panic; the gauge needs a cost. |

Kept: curve p = p0 + aS, f = 2 % both ways to the pot, T = τ·max(S, 0.9·HWM) with τ = 5 %, mode C, pot minimum, three Gaps (the page shows one headline, buy-then-rug; the other two sit behind a details view). The rug itself is unchanged.

## 1. Crate layout and build decisions

```
contracts/anyone-can-rug/        # the contract crate (cargo near new; then edit)
  src/lib.rs                     # #[near] contract, public methods, NEP impls
  src/math.rs                    # PURE. no env. U256, r(), inv(), t_required(), gap solvers
  src/events.rs                  # JSON event structs
  src/tests/{math,flow,storage,gaps,prop}.rs
  res/anyone_can_rug.wasm        # committed release artifact
integration-tests/               # separate crate, so dev-deps never touch the wasm
```

- `near-sdk` = "5.30.1"; `near-contract-standards` = "5.30.1"; `uint` = { version = "0.10", default-features = false }; `construct_uint!{ pub struct U256(4); }` in `math.rs`.
- Dev-deps: `near-sdk` with `unit-testing`, `proptest` = "1".
- Release profile: `opt-level="z"`, `lto=true`, `codegen-units=1`, `panic="abort"`, `overflow-checks=true`, `debug=false`.
- Token decimals **18**. `ONE = 10^18`. NEAR amounts in yocto (10^24).
- No `Ownable`, no pause, no `migrate`, no `update_contract`, no `#[init(ignore_state)]`. `grep -nE "predecessor_account_id\(\) *==|\bowner\b|migrate|ignore_state|deploy_contract|add_full_access_key|add_access_key|delete_account"` on `src/` must return nothing (`\bowner\b` deliberately does not match `owner_id`, which `FtMint`/`FtBurn` require; CI test, §13). Allowed `#[private]`, exactly two: `on_payout` and `ft_resolve_transfer`.

## 2. State

```rust
#[near(contract_state)] #[derive(PanicOnDefault)]
pub struct Contract {
    params: Params,                 // immutable; no setter exists
    token: FungibleToken,           // token.total_supply == S (circulating)
    metadata: LazyOption<FungibleTokenMetadata>,
    x: u128,                        // curve position, base units. x == S + B, x >= S
    reserve: u128,                  // yocto. always == r(x)
    pot: u128,                      // yocto. current round pot
    hwm: u128,                      // base units
    round_id: u64,                  // starts at 1
    journal: store::Vector<JournalEntry>,
    rugs: store::Vector<RugRecord>,
}
#[near(serializers=[borsh, json])] #[derive(Clone)]
pub struct Params {
    pub name: String, pub symbol: String,
    pub p0: U128,            // yocto per whole token. 0 < p0 <= 1e25
    pub a: U128,             // yocto per whole token per whole token. 0 < a <= 1e20
    pub fee_bps: u16,        // 1..=1000
    pub tau_bps: u16,        // 1..=5000
    pub hwm_floor_bps: u16,  // exactly 9000
    pub pot_min: U128,       // yocto. must be >= rug_fee + journal_fee
    pub min_buy: U128,       // yocto, after storage charges
    pub journal_fee: U128,   // yocto charged per journal entry
    pub rug_fee: U128,       // yocto charged on a rug (journal + rug record)
}
```

`const X_MAX: u128 = 10^27` (one billion whole tokens). Hard cap, enforced in `buy`.
Storage keys: `#[derive(BorshStorageKey, BorshSerialize)] enum StorageKey { Accounts, Metadata, Journal, Rugs }`.

Journal/rug types (borsh+json; all `U128` are JSON strings, `u64` timestamps are JSON numbers):

```rust
#[repr(u8)] enum Kind { Buy=0, Sell=1, Rug=2, PayoutFailed=3 } // JSON: lowercase strings buy|sell|rug|payout_failed
struct JournalEntry { kind: Kind, account: AccountId, tokens: U128, near: U128, fee: U128,
                      supply_after: U128, x_after: U128, pot_after: U128, ts_ms: u64, block: u64 }
```

Meaning of `near`/`fee`: Buy: `near` = curve cost paid, `fee` = fee. Sell: `near` = payout received, `fee` = fee. Rug: `near` = payout, `fee` = rug_fee charged. PayoutFailed: `near` = amount credited to the pot, `fee` = journal_fee, `tokens` = 0. An entry's index is its position in the vector (no stored id).

```rust
struct RugRecord { round_id: u64, rugger: AccountId, burned: U128, payout: U128,
                   pot_before: U128, supply_before: U128, x_after: U128, ts_ms: u64, block: u64 }
```

## 3. Public interface (exact)

```rust
#[init] pub fn new(params: Params) -> Self;             // validates ranges; no owner argument; x=S=reserve=pot=hwm=0; round_id=1
#[payable] pub fn buy(&mut self, min_out: U128) -> U128;                       // returns tokens minted
#[payable] pub fn sell(&mut self, amount: U128, min_out: U128) -> Promise;     // requires exactly 1 yocto
#[payable] pub fn rug(&mut self, round_id: u64, min_payout: U128, max_burn: U128) -> Promise; // exactly 1 yocto
#[private] pub fn on_payout(&mut self, account_id: AccountId, amount: U128, kind: String);  // never panics

// views
pub fn get_params(&self) -> Params;
pub fn get_state(&self) -> StateView;
pub fn get_gap_holder(&self) -> GapView;
pub fn get_gap_buy(&self, account_id: Option<AccountId>) -> GapBuyView;
pub fn get_gap_exit(&self, account_id: AccountId) -> GapView;
pub fn get_rugs(&self, from_index: u64, limit: u64) -> Vec<RugRecord>;      // limit capped at 50
pub fn get_rugs_len(&self) -> u64;
pub fn get_journal(&self, from_index: u64, limit: u64) -> Vec<JournalEntry>; // limit capped at 100
pub fn get_journal_len(&self) -> u64;
pub fn quote_buy(&self, near_in: U128, account_id: Option<AccountId>) -> U128;  // min_out helper
pub fn quote_sell(&self, amount: U128) -> U128;                                 // payout after fee and journal_fee
```

`StateView`: `{ supply, x, burned /* x-S */, reserve, pot, hwm, t_required, round_id, rugs_count, journal_len, spot_price /* yocto per whole token */, floor_price /* p at B */, floor_reserve /* r(B) */, balance, storage_cost, surplus: { positive, abs } /* balance-reserve-pot-storage_cost, signed: never panics when negative */ }`, all U128 except counters (u64) and `surplus`.

NEP-141 (`FungibleTokenCore`: `ft_transfer`, `ft_transfer_call`, `ft_total_supply` = S, `ft_balance_of`), `FungibleTokenResolver::ft_resolve_transfer`, NEP-145 (`StorageManagement`), and `FungibleTokenMetadataProvider::ft_metadata` (`spec "ft-1.0.0"`, `name`, `symbol` from params, `decimals 18`, a small inline SVG `icon`, `reference: None`). Implement all by delegating to `self.token`, as in the near-sdk `examples/fungible-token`, except the override below. In the `impl`, `ft_resolve_transfer` is `#[private]` (the library has no self-check).

**Override `storage_unregister(force)`:** always panics `E_UNREGISTER_DISABLED`, whatever the balance and `force`. Registration storage is never reclaimed: this is a deliberate NEP-145 deviation, documented in the README.

### 3.1 Stable errors (panic message starts with the code)

| Code | When |
|---|---|
| `E_ROUND_STALE` | `round_id` is not the current round |
| `E_POT_BELOW_MIN` | pot below `pot_min` |
| `E_BURN_ABOVE_MAX` | T above `max_burn` |
| `E_INSUFFICIENT_TOKENS` | balance below T or amount |
| `E_PAYOUT_BELOW_MIN` | payout below `min_payout` |
| `E_SLIPPAGE` | `min_out` not met (buy, sell) |
| `E_BELOW_MIN_BUY` | deposit after charges below `min_buy` |
| `E_SELL_TOO_SMALL` | gross does not cover fee and journal fee, or payout below `journal_fee` |
| `E_ABOVE_X_MAX` | buy above `X_MAX` |
| `E_UNREGISTER_DISABLED` | any `storage_unregister` |

The page's "race lost" screen is triggered by `E_ROUND_STALE` and `E_PAYOUT_BELOW_MIN` only; `E_BURN_ABOVE_MAX` re-quotes.

## 4. Curve math (all in `math.rs`, pure)

Definitions (U256 internally, `u128` outputs):

```
r(x)   = ceil( (2*p0*ONE*x + a*x*x) / (2*ONE*ONE) )
inv(R) = floor( ONE*(isqrt(p0*p0 + 2*a*R) - p0) / a )     // x whose area is R, rounded down
```

`isqrt` = Newton on U256 from a bit-length start; returns floor. Bounds hold for x ≤ X_MAX, a ≤ 1e20, p0 ≤ 1e25, R ≤ u128::MAX. `new` enforces the parameter bounds; `r(x)+net` uses `checked_add`.

**Property (proved):** `r(inv(R)) ≤ R` for any integer R, because `r` is monotone and the exact area at the true root is exactly R; we floor below it. So the buy formula can never charge more than was paid.

Fee (always rounded up): `fee = ceil(v * fee_bps / 10_000)`.

### 4.1 `buy(min_out)`, in this exact order

1. `deposit = attached`. If predecessor not registered: `require deposit >= reg_min`, `deposit -= reg_min`, `token.internal_register_account(predecessor)` (reg_min = `storage_balance_bounds().min`; registration is automatic, the user need not call `storage_deposit`).
2. `deposit -= journal_fee` (panic if insufficient). `require deposit >= min_buy`, else `E_BELOW_MIN_BUY`.
3. `fee = ceil(deposit*fee_bps/10000)`; `net = deposit - fee`.
4. `x2 = inv(r(x) + net)`; `require x2 > x`, `x2 <= X_MAX` (`E_ABOVE_X_MAX`). `minted = x2 - x`; `require minted >= min_out` else `E_SLIPPAGE`.
5. `cost = r(x2) - r(x)` (≤ net by §4); `dust = net - cost`.
6. `reserve += cost`; `x = x2`; `pot += fee + dust`; `token.internal_deposit(account, minted)`; `hwm = max(hwm, S_after)`.
7. Push journal (`Buy`, tokens=minted, near=cost, fee=fee+dust), `FtMint{memo:"buy"}.emit()`, emit `buy`. `assert_solvent(0)`.

### 4.2 `sell(amount, min_out)`

1. `assert_one_yocto()`. `require amount > 0`, balance ≥ amount (so `amount ≤ S`, so `x-amount ≥ B`: a sell can never touch the locked region).
2. `gross = r(x) - r(x-amount)`; `fee = ceil(gross*fee_bps/10000)`; `require gross > fee + journal_fee` and `payout = gross - fee - journal_fee >= journal_fee`, else `E_SELL_TOO_SMALL`; `require payout >= min_out`, else `E_SLIPPAGE`.
3. `token.internal_withdraw(account, amount)`; `x -= amount`; `reserve -= gross`; `pot += fee`. HWM unchanged. (`journal_fee` stays in the contract and pays for the journal entry's storage.)
4. Journal (`Sell`), `FtBurn{memo:"sell"}.emit()`, emit `sell`. `assert_solvent(payout)`. Payout promise (§7).

**Near the curve position.** Selling all of S moves x to exactly B; `r(B)` remains in `reserve` forever (locked by construction). With S = 0 and B > 0, the next buy starts at price `p(B)`, and it can only ever sell back down to x = B. So the sell price of the last token is `p(B)`, the floor, up to rounding. This is the "rising floor" and it is the only reason mode C exists. It is **a NEAR price on the curve, not a guarantee of any value**.

### 4.3 `rug(round_id, min_payout, max_burn)`

Order:
1. `assert_one_yocto()`. `require round_id == self.round_id`, else `E_ROUND_STALE`.
2. `require pot >= pot_min`, else `E_POT_BELOW_MIN`.
3. `T = t_required()` (§5). `require T > 0`; `T <= max_burn`, else `E_BURN_ABOVE_MAX`; `balance(predecessor) >= T`, else `E_INSUFFICIENT_TOKENS`.
4. `payout = pot - rug_fee`; `require payout >= min_payout`, else `E_PAYOUT_BELOW_MIN`.
5. `pot_before = pot`; `token.internal_withdraw(predecessor, T)`; `pot = 0`; `hwm = max(S_after, floor(hwm*hwm_floor_bps/10000))`; `round_id += 1`. `x`, `reserve` unchanged (mode C).
6. Push RugRecord and journal (`Rug`), `FtBurn{memo:"rug"}.emit()`, emit `rug`.
7. `assert_solvent(payout)`. Payout promise (§7).

A losing competitor's call reverts on step 1 or 2, with no tokens lost. This is the whole race protection.

**Atomic buy+rug:** the page sends one transaction with two `FunctionCall` actions, `buy` then `rug`, to the contract. NEAR batch actions in one receipt succeed or revert together (near/docs). No `buy_and_rug` method is needed. `rug` does return a payout promise: the batch stays atomic because `rug` panics before creating it, and the payout follows after.

## 5. Threshold and HWM

```
t_required() = ceil( tau_bps * max(S, floor(hwm*hwm_floor_bps/10000)) / 10000 )
```
- HWM update: on buy, `hwm = max(hwm, S_after)`. On sell: nothing. On rug: step 5 above.
- `T` is **not** snapshotted per round. It floats. `max_burn` protects the rugger (C1).
- `S` falling cannot lower T below `τ·0.9·HWM`: atomic sell-then-rug is bounded.
- After rug: floor `0.9·HWM` decays 10 % per rug, so a dead coin can still be rugged (sim's "hwm" rule).
- When `pot > 0`, HWM > 0 (a fee requires a buy, and sells before any buy are impossible), so T ≥ 1. If T > S, no holder can rug; `get_gap_holder` reports `feasible:false`, buying first remains possible.

## 6. Gaps: exact definitions

All three values exclude gas; `value` can be negative, so serialize as `{ positive: bool, abs: U128 }`. `GapView = { feasible, positive, abs, tokens_needed, t_required, pot }`. Common: `ok = pot-eligible` as noted.

- **`get_gap_holder`** ("you hold ≥ T, sell or rug?"): feasible iff `T ≤ S` and `pot ≥ pot_min`. `value = (pot − rug_fee) − net_sell(T)`, `net_sell(v) = gross − ceil(gross*fee_bps/10000)`, `gross = r(x) − r(x−v)`. Tokens needed: T.
- **`get_gap_buy(account_id?)`**: with `bal = balance or 0`. All subtractions saturate at 0 (never underflow). Solve size (C2), rounded up, plus 1 base-unit margin:
  `dx = max(sat(ceil((tau_bps*S − bal*10000)/(10000−tau_bps))), sat(ceil(tau_bps*floor(hwm*9000/10000)/10000) − bal)) + 1 + floor(ONE/a) + 2` (`inv` floors the square root, so a deposit that pays for `dx` can mint up to `ONE/a + 1` base units less).
  `deposit_needed = max(ceil((r(x+dx)−r(x)+1)*10000/(10000−fee_bps)) + journal_fee + reg, min_buy + journal_fee + reg)`, where `reg = reg_min if unregistered else 0`. `fee_on` is computed on the deposit after these deductions. From that deposit, compute the real `minted`, `cost_real = r(x+minted) − r(x)` and the post-buy `t_required`.
  Fees paid go to the pot and are recaptured in the same batch, so `value = pot − rug_fee − cost_real − journal_fee − reg` (leftover tokens are not valued). `cost = cost_real + journal_fee + reg`, the figure the gauge prints as the rug price. Feasible iff `x + dx ≤ X_MAX`, the real `x2 ≤ X_MAX` and `pot + fee + dust ≥ pot_min`; the numbers are still computed when infeasible. `GapBuyView` extends `GapView` with `deposit_needed`, `min_out = minted`, `cost`, and `t_required` (post-buy T). When `bal ≥ T`, the page sends a plain `rug` with no buy.
  **Page rule (audit N1):** `max_burn = ceil(t_required * 1.01)` and the buy deposit is `deposit_needed * 1.01`, so a small organic buy just before does not revert the batch; surplus stays as tokens.
- **`get_gap_exit(account_id)`** (largest-holder exit; the page feeds it the top holder derived from the journal plus `ft_balance_of`): `W = balance`. Largest sale that still leaves ≥ T:
  `s = min( floor((W*10000 − tau_bps*S)/(10000−tau_bps)), W − ceil(tau_bps*floor(hwm*9000/10000)/10000) )`, feasible iff `s ≥ 0` (signed intermediate; use i256-safe branching) and `W ≥ T` (and `pot ≥ pot_min`). `value = net_sell(s) + fee(s) + pot − rug_fee − net_sell_at_W(W)`, where the first term uses `x` then `x−s`, and `net_sell_at_W` is selling everything W from `x`. journal fees cancel.

## 7. Failed payout and solvency

Payout promise (identical for `sell`/`rug`):

```rust
Promise::new(account.clone()).transfer(NearToken::from_yoctonear(amount))
  .then(Self::ext(env::current_account_id())
          .with_static_gas(Gas::from_tgas(10))
          .on_payout(account, U128(amount), kind.into()))
```

`on_payout` (`#[private]`, never panics, body uses only additions and `near_sdk::is_promise_success()`): if the transfer failed, `pot += amount − journal_fee`, push a `PayoutFailed` journal entry and emit `payout_failed`, so replaying the journal still reproduces the pot (`rug` can afford it because `pot_min ≥ rug_fee + journal_fee`; `sell` because `payout ≥ journal_fee`). Measure the 10 Tgas in the sandbox. The chain returns the failed transfer's deposit to the contract within about a block: during that short window the callback may have run first, the solvency check can briefly revert trades (accepted, retry). Tokens already burned stay burned. Message: "if you delete your account while your payout flies, the pot eats it".

```
assert_solvent(outgoing):  env::account_balance() - outgoing >= reserve + pot + storage_usage()*storage_byte_cost()
```
Called last in `buy`, `sell`, `rug`, after `journal.flush()` and `rugs.flush()` (`store::Vector` writes on Drop, so `storage_usage()` would otherwise miss the new entry). `env::account_balance()` includes the attached deposit (near-sdk source). Panic reverts the action entirely; a panicking buy/sell/rug means the deployer's bootstrap ran out, and anyone can fix it with a plain NEAR transfer. Bootstrap: ≥ 1 NEAR above wasm storage at deploy, not counted in pot.

Conservation identity (tested, not asserted on-chain): `Σ attached in buys + Σ 1-yocto + bootstrap = balance + Σ payouts + Σ storage refunds`. With `surplus` = what is left after `reserve + pot + storage_cost`. Nothing in the code can spend from `reserve` or `pot` except `sell` (reserve) and `rug` (pot): review point.

## 8. Storage model

| What | Who pays | How |
|---|---|---|
| NEP-145 registration (library default, ~0.00125 NEAR, account_storage_usage measured for a 64-char id) | Buyer | Auto-deducted in `buy` if unregistered, or `storage_deposit` |
| Journal entry (buy, sell) | Trader | `journal_fee` deducted from deposit (buy) or payout (sell) |
| Journal entry + RugRecord (rug) | Rugger | `rug_fee` deducted from pot |

`journal_fee = 3e21` (0.003 NEAR, room for ≈ 300 bytes), `rug_fee = 6e21`. A unit test flushes, then measures the real `storage_usage` delta with a 64-char account and asserts ≤ fee. The journal never shrinks: this is deliberate (a mint-burn log that deletes history is not a log).

## 9. Events (NEP-297)

Standard FT events from `near_contract_standards::fungible_token::events`: `FtMint`, `FtBurn`, and `FtTransfer` from the library's `ft_transfer`. Exact lines:

```
EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_mint","data":[{"owner_id":"alice.testnet","amount":"123","memo":"buy"}]}
EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_burn","data":[{"owner_id":"alice.testnet","amount":"123","memo":"sell"}]}
EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_burn","data":[{"owner_id":"alice.testnet","amount":"50000","memo":"rug"}]}
```

Custom standard `anyone_can_rug`, version `1.0.0`, all numbers as decimal strings except `round_id`, `seq` (journal index), `ts_ms`, `block`:

```
EVENT_JSON:{"standard":"anyone_can_rug","version":"1.0.0","event":"buy","data":[{"seq":7,"account":"alice.testnet","tokens":"1","near":"2","fee":"3","supply":"4","x":"5","pot":"6","ts_ms":1730000000000,"block":123}]}
EVENT_JSON:{"standard":"anyone_can_rug","version":"1.0.0","event":"sell","data":[{"seq":8,"account":"alice.testnet","tokens":"1","near":"2","fee":"3","supply":"4","x":"5","pot":"6","ts_ms":1730000000000,"block":123}]}
EVENT_JSON:{"standard":"anyone_can_rug","version":"1.0.0","event":"rug","data":[{"seq":9,"round_id":1,"account":"alice.testnet","burned":"1","payout":"2","pot_before":"3","supply":"4","x":"5","next_round_id":2,"ts_ms":1730000000000,"block":123}]}
EVENT_JSON:{"standard":"anyone_can_rug","version":"1.0.0","event":"payout_failed","data":[{"seq":10,"account":"alice.testnet","amount":"2","kind":"sell"}]}
```

**Page contract:** the journal comes from `get_journal` over RPC, no backend. Poll `get_journal_len`, read new entries. Each entry links to the explorer via `block`. Events remain for third-party indexers and for judges reading a transaction.

## 10. No admin, no upgrade: proof

Deploy sequence (§14), last step removes the only key. A judge verifies with no secret:

```bash
near account list-keys <ID> network-config testnet now       # empty
near account view-account-summary <ID> network-config testnet now  # code hash, no access keys
```

Or RPC: `query/view_access_key_list` returns `keys: []`. `view_account.code_hash` (sha256, base58) must equal `sha256` of committed `res/anyone_can_rug.wasm`.

No code path mutates `params`; no key can deploy or sign for the account. NEAR's protocol cannot deploy without a key on that account. **Bug = redeploy under a new account id.** Reproducible builds: we commit the exact wasm hash. `cargo near build reproducible-wasm` is attempted once (docker present); if the x86 image fails on ARM64, the README says: "the wasm is committed and matches the on-chain hash; rebuild determinism is not proven". Do not spend a day on this.

Do not promise a "no deploy import in the wasm" check: `PromiseAction::add` references every action host function, so those imports likely remain. The proof is zero keys plus the source review.

## 11. Concrete parameters (frozen after the simulator, see `00-INDEX.md`)

| Param | Live demo | Fast instance |
|---|---|---|
| name / symbol | Anyone Can Rug / RUGPRICE | Anyone Can Rug (fast) / RUGFAST |
| p0 | `"10000000000000000000"` (1e19, 0.00001 NEAR) | `"5000000000000000000"` (0.000005) |
| a | `"100000000000000"` (1e14) | `"50000000000000"` (5e13) |
| fee_bps / tau_bps / hwm_floor_bps | 200 / 500 / 9000 | 200 / 500 / 9000 |
| pot_min | `"50000000000000000000000"` (0.05 NEAR) | `"50000000000000000000000"` (0.05) |
| min_buy | `"50000000000000000000000"` (0.05) | `"20000000000000000000000"` (0.02) |
| journal_fee / rug_fee | `"3000000000000000000000"` / `"6000000000000000000000"` | same |

Worked: live at S = 1M $RUGPRICE: spot 0.00011, R = 60 NEAR, T = 50 000 $RUGPRICE, buy-then-rug cost about 5.75 NEAR, so the pot catches the price after about 4.8× reserve turnover. Fast at S = 100k: spot 0.00001, R = 0.75, T = 5 000, cost about 0.053, about 3.5× turnover. Ratio τ/f = 2.5 inside the measured viable zone.
Before the final deployment, run the simulator with exactly these integers; if it moves them, change only the init JSON (a new deployment). Do not change any contract source for tuning.

`deploy/{live,fast}.json` are the canonical init files (`sim/out/selected-params.json` only feeds them). `deploy/live.json` example init:

```json
{"params":{"name":"Anyone Can Rug","symbol":"RUGPRICE","p0":"10000000000000000000","a":"100000000000000","fee_bps":200,"tau_bps":500,"hwm_floor_bps":9000,"pot_min":"50000000000000000000000","min_buy":"50000000000000000000000","journal_fee":"3000000000000000000000","rug_fee":"6000000000000000000000"}}
```

## 12. Threats

| Threat | Handling |
|---|---|
| Two ruggers race | `round_id` then `pot_min`: loser reverts on the promise-free checks |
| Pump S before victim's rug | `max_burn` reverts. Griefing still costs the attacker ~4 % of its size, paid into the pot |
| Sell S down to lower T | Bounded by `0.9·HWM` floor |
| Flash buy → rug → sell | Pays 2 % twice; T is computed after S rose; burning at an inflated price is worse than `dx`. Test `prop_no_free_rug` |
| Round-trip to drain the pot via rounding | Path-independent `r`; fees ceil |
| Reentrancy | Only outgoing promises are payouts and `ft_transfer_call`; all state written before (standard library for the latter) |
| Calling `on_payout` or `ft_resolve_transfer` directly | `#[private]`; lint and test `resolve_not_callable_externally` |
| Silent burn through `ft_transfer_call` refund | Unreachable: `storage_unregister` always panics |
| Storage exhaustion by spam accounts | Registration and journal are prepaid; rate is bounded by gas |
| Attached deposit vs refund | Any panic refunds the deposit to the caller; no partial state |
| Whale | Not prevented. Documented: can get 100 % of rugs |
| Sybil | Not relevant to T (global); no per-account rule to game. Multiple accounts pay more gas and registration |
| Front-running | NEAR has no public mempool of the kind on Ethereum but chunk producers can reorder; protection is `min_out`, `min_payout`, `max_burn` |

Not defended, on purpose: price manipulation for profit against other traders. A curve has none of a DEX's depth problems but has a large slippage cost; it is the game.

## 13. Test plan

Run `cargo test` in `contracts/anyone-can-rug`.

**Unit, `math.rs`:** `r_zero_is_zero`, `r_is_monotone`, `r_matches_python_vectors` (10 hard-coded BigInt vectors), `r_ceil_rounds_up`, `inv_never_overshoots`, `inv_floor_minimal_dust`, `isqrt_exact_squares`, `isqrt_floors`, `isqrt_u256_max_input`, `no_overflow_at_x_max_a_max`, `fee_ceil_rounds_up`, `fee_ceil_exact_multiple`, `t_required_max_of_s_and_floor`, `gap_buy_dx_when_s_dominates`, `gap_buy_dx_when_hwm_dominates`, `gap_exit_min_of_two_roots`.

**Unit, `flow.rs`** (`VMContextBuilder`, `testing_env!`, harness tracking balance and storage usage): `init_sets_state_zero`, `init_rejects_out_of_range_params` (one per bound), `init_has_no_owner_field_in_get_params`, `buy_mints_and_fills_reserve_exactly`, `buy_auto_registers_when_needed`, `buy_panics_below_min_buy_refunds`, `buy_respects_min_out`, `buy_updates_hwm`, `buy_rejects_above_x_max`, `buy_dust_goes_to_pot`, `sell_requires_one_yocto`, `sell_pays_gross_minus_fee_minus_journal_fee`, `sell_respects_min_out`, `sell_too_small_panics`, `sell_does_not_change_hwm`, `sell_all_returns_x_to_b`, `sell_at_b_price_is_floor`, `rug_requires_one_yocto`, `rug_wrong_round_reverts`, `rug_below_pot_min_reverts`, `rug_max_burn_exceeded_reverts`, `rug_min_payout_reverts`, `rug_insufficient_balance_reverts`, `rug_burns_exactly_t`, `rug_zeroes_pot_and_advances_round`, `rug_updates_hwm_to_max_of_s_and_floor`, `rug_keeps_x_and_reserve`, `rug_appends_record_and_journal`, `failed_payout_journaled_and_credits_pot_minus_journal_fee`, `failed_payout_does_not_return_tokens`, `on_payout_success_noop`, `on_payout_not_private_callable_rejected`, `resolve_not_callable_externally`, `init_rejects_pot_min_below_fees`, `sell_payout_below_journal_fee_panics`, `surplus_serializes_when_negative`, `errors_use_stable_codes`, `vectors_replay` (replays `fixtures/vectors.json` with `include_str!`; every field must match).

**Unit, `storage.rs`:** `ft_transfer_requires_registered`, `transfer_does_not_change_x_or_s`, `register_twice_is_noop`, `storage_unregister_always_panics`, `journal_fee_covers_64_char_account` (flush first, or it measures 0), `rug_fee_covers_64_char_account`, `metadata_is_nep148_valid`, `journal_pagination_bounds`, `journal_limit_capped_at_100`, `rugs_pagination`.

**Unit, `gaps.rs`:** `gap_holder_infeasible_when_t_gt_s`, `gap_holder_value_matches_sell_vs_rug`, `gap_buy_value_matches_real_batch` (execute buy+rug in mock, compare), `gap_buy_deposit_needed_is_sufficient`, `gap_buy_accounts_for_existing_balance`, `gap_exit_value_matches_real_sequence`, `gap_exit_leaves_exactly_enough`, `gaps_report_negative_correctly`.

**Property/fuzz (`prop.rs`, `proptest`, ≥ 256 cases, deterministic `Config::with_failure_persistence` off):** random sequences of buy/sell/rug/transfer from 5 accounts:
- `prop_reserve_equals_r_x`: `reserve == r(x)` after every op.
- `prop_x_eq_s_plus_burned`: `x >= S`, and x − S == sum of rug burns.
- `prop_solvent`: balance model ≥ reserve + pot + storage.
- `prop_supply_is_sum_of_balances`.
- `prop_supply_matches_journal`: replaying journal mints − burns equals S.
- `prop_pot_matches_journal`: replay gives pot.
- `prop_hwm_monotone_except_rug`, `prop_hwm_ge_s`.
- `prop_round_id_never_regresses`.
- `prop_round_trip_loses_exactly_fees`: buy then immediately sell the same tokens returns deposit − fees − journal fees (± dust).
- `prop_split_buy_no_advantage`: two buys never mint more than one combined buy minus the extra fee rounding (with fee 0, equal).
- `prop_no_free_rug`: for any atomic buy/rug/sell sequence by an account holding 0 tokens, net NEAR gain ≤ `max(0, gap_buy_value)` + the cost of the `ONE/a + 4` margin + 1 yocto, ignoring gas.
- `prop_gap_buy_rug_always_succeeds`: after any sequence, `min_out` and `deposit_needed` from `get_gap_buy` make the batch succeed.

**CI lint (`grep_no_admin`):** no admin identifiers, exactly two `#[private]`.

**Sandbox integration (`integration-tests/`):** `near-workspaces` 0.24 (uses a `near-sandbox` binary) against the wasm. The binary for Linux-aarch64 is published at `build.nearprotocol.com/nearcore/Linux-aarch64/...` (HEAD checked 200 for 2.8.0, not run on this machine). How to check it works here: `cargo test -p integration-tests sandbox_smoke -- --nocapture`. Tests: `sandbox_smoke`, `sandbox_buy_sell_rug_full_flow`, `sandbox_batch_buy_then_rug_atomic`, `sandbox_batch_reverts_rug_failure_keeps_no_tokens`, `sandbox_failed_payout_goes_to_pot` (receiver deletes itself between), `sandbox_vectors_replay_20` (20 sequences on the wasm, gas and storage excluded), `sandbox_events_exact_json`, `sandbox_gas_buy_sell_rug_under_50_tgas` (print real numbers). `near-workspaces` version churn is high; if it needs more than 30 minutes, use `near-sandbox` 0.4 + `near-api` (as the near skill recommends), then the fallback.

**Fallback (if no sandbox on ARM64):** `scripts/e2e-testnet.ts`: throwaway accounts via `helper.nearprotocol.com`, fresh contract per run, same scenarios except "failed payout" (covered by unit test only). Run from the operator machine, not CI.

## 14. Deploy

```bash
cd contracts/anyone-can-rug && cargo near build non-reproducible-wasm
cp ../../target/near/anyone_can_rug.wasm res/ ; sha256sum res/anyone_can_rug.wasm   # record in deploy/live.sha256
# <ID> = anyonecanrug.testnet (live) or rugfast.acr-ops.testnet (fast, created as a sub-account of the operator); listed in web/public/instances.json
near account create-account sponsor-by-faucet-service <ID> autogenerate-new-keypair save-to-keychain network-config testnet create
# fund to wasm_size * 1e-5 NEAR/byte + 1 NEAR bootstrap (ask the faucet for a second funded account if needed; transfer with near tokens)
near contract deploy <ID> use-file res/anyone_can_rug.wasm with-init-call new file-args deploy/live.json prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
near account list-keys <ID> network-config testnet now     # note the public key
near account delete-keys <ID> public-keys ed25519:<PK> network-config testnet sign-with-keychain send
near account list-keys <ID> network-config testnet now     # now empty
```

**Order matters:** the key is deleted only after the page and the smoke scenario work against this account. Do the same for the fast instance. Rehearse once on a throwaway account before the real one.

## 15. `npm run verify` (read-only, no secrets, RPC `https://test.rpc.fastnear.com`)

Reads `deploy/live.json` and `deploy/fast.json` and, for both accounts:

Every query of a run is pinned to one final `block_id`, read once at the start: a buy landing mid-run must not produce a false FAIL.

1. `view_access_key_list` is empty.
2. `view_account.code_hash` equals base58 sha256 of `res/anyone_can_rug.wasm`.
3. `get_params` deep-equals the init JSON.
4. `get_state`: `reserve == r(x)` recomputed in BigInt in TS; `x ≥ supply`; `surplus.positive` (a transient negative during a failed payout is reported with its block).
5. `ft_metadata`: `spec == "ft-1.0.0"`, `decimals == 18`.
6. Paginates `get_journal`: replay reproduces `supply` and `pot`; `x − supply` equals the sum of rug burns; each entry's `block` is ≤ the current head.
7. Paginates `get_rugs`: count matches `round_id − 1`, each `burned` matches its journal entry.

Prints PASS/FAIL per check and exits non-zero on any FAIL. The page shows the same `get_state` numbers; the README tells the judge to compare.

**What verify proves, and what it does not (say it in the README):** no keys, hash equality, and bookkeeping consistency on past operations. It does not prove that source matches wasm unless the rebuild does, that future operations are safe, or that rugs work: the unit, property and sandbox tests cover behaviour, and `npm run try:testnet` performs a real rug.

## 16. Honest limits (paste into README)

- **"Anyone can take the pot" is the whole promise.** Fees are 2 % per trade, in and out. Bots and whales will probably win. In our simulation, {no_bot}% of games without an attentive bot saw no rug, and a {w}% holder took {whale_share}% of the rugs (values from `web/public/sim/summary.json`). Behaviour in the simulation is assumed, not measured.
- The floor is a **price on a bonding curve in NEAR**, reachable only by selling all tokens along the curve, and only that. It is not a guarantee of value; the word "floor" means this exact curve position.
- Burned tokens' NEAR is locked forever in the reserve. Nobody can recover it. This is the design.
- Sybil resistance: there is none for the threshold, and none is claimed. T is a share of supply, not a per-account limit. The attacker pays gas and registration, which only slows them. Enough for a testnet demo, nothing more.
- Transfers are ordinary NEP-141. A wrapper or a DEX outside the curve is not prevented.
- Immutable means a bug cannot be fixed: a fix is a new contract account, and the old one stays.
- Testnet only. Testnet NEAR has no value.
- NEP-145 deviation: `storage_unregister` always panics, so registration storage is never refunded. This closes a griefing path.
- `verify` checks keys, hash and bookkeeping on past operations, not future behaviour.
- The rebuild determinism of the wasm is not proven unless the README says otherwise.
