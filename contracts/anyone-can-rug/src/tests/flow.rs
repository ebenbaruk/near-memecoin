use near_sdk::json_types::U128;
use near_sdk::{serde_json, test_utils::get_logs};

use super::harness::*;
use crate::math::{self, ONE, X_MAX};
use crate::{Kind, Params};

fn funded() -> Chain {
    let mut h = Chain::new(test_params());
    h.buy("alice", 5 * NEAR);
    h
}

fn curve(h: &mut Chain) -> math::Curve {
    h.view(|c| c.curve())
}

#[test]
fn init_sets_state_zero() {
    let mut h = Chain::new(test_params());
    let s = h.view(|c| c.get_state());
    assert_eq!(s.supply.0 + s.x.0 + s.reserve.0 + s.pot.0 + s.hwm.0 + s.burned.0, 0);
    assert_eq!(s.round_id, 1);
    assert_eq!(s.journal_len, 0);
    assert_eq!(s.rugs_count, 0);
}

#[test]
fn init_rejects_out_of_range_params() {
    let mutate: Vec<fn(&mut Params)> = vec![
        |p| p.name = "".into(),
        |p| p.symbol = "".into(),
        |p| p.p0 = U128(0),
        |p| p.p0 = U128(10u128.pow(25) + 1),
        |p| p.a = U128(0),
        |p| p.a = U128(10u128.pow(20) + 1),
        |p| p.fee_bps = 0,
        |p| p.fee_bps = 1001,
        |p| p.tau_bps = 0,
        |p| p.tau_bps = 5001,
        |p| p.hwm_floor_bps = 8999,
        |p| p.min_buy = U128(0),
    ];
    for (i, m) in mutate.iter().enumerate() {
        let mut p = test_params();
        m(&mut p);
        let err = Chain::try_new(p).err().unwrap_or_else(|| panic!("case {i} accepted"));
        assert_eq!(code(&err), "E_BAD_PARAMS", "case {i}");
    }
}

#[test]
fn init_rejects_pot_min_below_fees() {
    let mut p = test_params();
    p.pot_min = U128(p.rug_fee.0 + p.journal_fee.0 - 1);
    assert_eq!(code(&Chain::try_new(p).err().unwrap()), "E_BAD_PARAMS");
}

#[test]
fn init_has_no_owner_field_in_get_params() {
    let mut h = Chain::new(test_params());
    let json = serde_json::to_value(h.view(|c| c.get_params())).unwrap();
    let keys: Vec<&String> = json.as_object().unwrap().keys().collect();
    for forbidden in [concat!("own", "er"), concat!("own", "er_id"), "admin", "authority"] {
        assert!(!keys.iter().any(|k| *k == forbidden), "{forbidden}");
    }
}

#[test]
fn buy_mints_and_fills_reserve_exactly() {
    let mut h = Chain::new(test_params());
    let c = curve(&mut h);
    let minted = h.buy("alice", 2 * NEAR);
    let s = h.view(|c| c.get_state());
    assert_eq!(s.supply.0, minted);
    assert_eq!(s.x.0, minted);
    assert_eq!(s.reserve.0, math::r(c, minted));
    assert_eq!(h.balance_of("alice"), minted);
    assert_eq!(s.hwm.0, minted);
}

#[test]
fn buy_auto_registers_when_needed() {
    let mut h = Chain::new(test_params());
    let p = test_params();
    let exact = REG_MIN + p.journal_fee.0 + p.min_buy.0;
    h.try_buy("bob", exact, 0).unwrap();
    assert!(h.balance_of("bob") > 0);
    let second = h.try_buy("bob", p.journal_fee.0 + p.min_buy.0, 0).unwrap();
    assert!(second > 0);
}

#[test]
fn buy_panics_below_min_buy_refunds() {
    let mut h = Chain::new(test_params());
    let p = test_params();
    let before = h.balance;
    assert_err(h.try_buy("bob", 1, 0), "E_BELOW_MIN_BUY");
    assert_err(h.try_buy("bob", REG_MIN + p.journal_fee.0 + p.min_buy.0 - 1, 0), "E_BELOW_MIN_BUY");
    assert_eq!(h.balance, before);
    assert_eq!(h.view(|c| c.token.accounts.contains_key(&acct("bob"))), false);
}

#[test]
fn buy_respects_min_out() {
    let mut h = Chain::new(test_params());
    let quote = h.view(|c| c.quote_buy(U128(NEAR), Some(acct("alice"))).0);
    assert_err(h.try_buy("alice", NEAR, quote + 1), "E_SLIPPAGE");
    assert_eq!(h.try_buy("alice", NEAR, quote).unwrap(), quote);
}

#[test]
fn buy_updates_hwm() {
    let mut h = funded();
    let first = h.view(|c| c.hwm);
    h.buy("bob", NEAR);
    assert!(h.view(|c| c.hwm) > first);
}

#[test]
fn buy_rejects_above_x_max() {
    let mut h = Chain::new(test_params());
    let c = curve(&mut h);
    let huge = math::r(c, X_MAX) * 2;
    assert_err(h.try_buy("alice", huge, 0), "E_ABOVE_X_MAX");
}

#[test]
fn buy_dust_goes_to_pot() {
    let mut h = Chain::new(test_params());
    let p = test_params();
    let d = 2 * NEAR;
    h.buy("alice", d);
    let deposit = d - REG_MIN - p.journal_fee.0;
    let fee = math::fee_ceil(deposit, p.fee_bps);
    let s = h.view(|c| c.get_state());
    let dust = deposit - fee - s.reserve.0;
    assert_eq!(s.pot.0, fee + dust);
    assert!(dust < 10_000_000);
}

#[test]
fn sell_requires_one_yocto() {
    let mut h = funded();
    let id = acct("alice");
    let err = h.call(id.as_str(), 0, vec![], |c| { let _ = c.sell(U128(ONE), U128(0)); }).unwrap_err();
    assert!(err.contains("yocto"), "{err}");
}

#[test]
fn sell_pays_gross_minus_fee_minus_journal_fee() {
    let mut h = funded();
    let p = test_params();
    let c = curve(&mut h);
    let (x, pot) = h.view(|c| (c.x, c.pot));
    let amount = 1000 * ONE;
    let gross = math::r(c, x) - math::r(c, x - amount);
    let fee = math::fee_ceil(gross, p.fee_bps);
    let before = h.balance;
    let payout = h.sell("alice", amount);
    assert_eq!(payout, gross - fee - p.journal_fee.0);
    assert_eq!(h.balance, before + 1 - payout);
    assert_eq!(h.view(|c| c.pot), pot + fee);
}

#[test]
fn sell_respects_min_out() {
    let mut h = funded();
    let q = h.view(|c| c.quote_sell(U128(1000 * ONE)).0);
    assert_err(h.try_sell("alice", 1000 * ONE, q + 1), "E_SLIPPAGE");
    assert_eq!(h.try_sell("alice", 1000 * ONE, q).unwrap(), q);
}

#[test]
fn sell_too_small_panics() {
    let mut h = funded();
    assert_err(h.try_sell("alice", 1, 0), "E_SELL_TOO_SMALL");
    assert_err(h.try_sell("alice", 0, 0), "E_SELL_TOO_SMALL");
    assert_err(h.try_sell("bob", ONE, 0), "E_INSUFFICIENT_TOKENS");
}

#[test]
fn sell_payout_below_journal_fee_panics() {
    let mut h = funded();
    let p = test_params();
    let c = curve(&mut h);
    let x = h.view(|c| c.x);
    // Largest amount whose payout stays below the journal fee.
    let mut lo = 0u128;
    let mut hi = 10_000 * ONE;
    let payout = |q: u128| {
        let gross = math::r(c, x) - math::r(c, x - q);
        gross.saturating_sub(math::fee_ceil(gross, p.fee_bps)).saturating_sub(p.journal_fee.0)
    };
    while hi - lo > 1 {
        let mid = (lo + hi) / 2;
        if payout(mid) < p.journal_fee.0 { lo = mid } else { hi = mid }
    }
    assert_err(h.try_sell("alice", lo, 0), "E_SELL_TOO_SMALL");
    assert!(h.try_sell("alice", hi, 0).is_ok());
}

#[test]
fn sell_does_not_change_hwm() {
    let mut h = funded();
    let hwm = h.view(|c| c.hwm);
    h.sell("alice", 1000 * ONE);
    assert_eq!(h.view(|c| c.hwm), hwm);
}

#[test]
fn sell_all_returns_x_to_b() {
    let mut h = funded();
    h.buy("bob", NEAR);
    h.rug("alice");
    let (bob, alice) = (h.balance_of("bob"), h.balance_of("alice"));
    h.sell("bob", bob);
    h.sell("alice", alice);
    let s = h.view(|c| c.get_state());
    assert_eq!(s.supply.0, 0);
    assert_eq!(s.x.0, s.burned.0);
    assert_eq!(s.reserve.0, s.floor_reserve.0);
}

#[test]
fn sell_at_b_price_is_floor() {
    let mut h = funded();
    h.rug("alice");
    let bal = h.balance_of("alice");
    let c = curve(&mut h);
    let (x, floor) = h.view(|c| (c.x, c.get_state().floor_price.0));
    let last = ONE;
    h.sell("alice", bal - last);
    let gross = math::r(c, x - bal + last) - math::r(c, x - bal);
    // The last whole token sells within one yocto-per-token step of the floor.
    assert!(gross >= floor && gross <= floor + c.a + 1, "gross {gross} floor {floor}");
}

fn rug_err(h: &mut Chain, round: u64, min_payout: u128, max_burn: u128, expected: &str) {
    assert_err(h.try_rug_full("alice", round, min_payout, max_burn), expected);
}

#[test]
fn rug_requires_one_yocto() {
    let mut h = funded();
    let id = acct("alice");
    let err = h.call(id.as_str(), 2, vec![], |c| { let _ = c.rug(1, U128(0), U128(u128::MAX)); }).unwrap_err();
    assert!(err.contains("yocto"), "{err}");
}

#[test]
fn rug_wrong_round_reverts() {
    let mut h = funded();
    rug_err(&mut h, 2, 0, u128::MAX, "E_ROUND_STALE");
}

#[test]
fn rug_below_pot_min_reverts() {
    let mut p = test_params();
    p.pot_min = U128(100 * NEAR);
    let mut h = Chain::new(p);
    h.buy("alice", NEAR);
    rug_err(&mut h, 1, 0, u128::MAX, "E_POT_BELOW_MIN");
}

#[test]
fn rug_max_burn_exceeded_reverts() {
    let mut h = funded();
    let t = h.view(|c| c.t_required());
    rug_err(&mut h, 1, 0, t - 1, "E_BURN_ABOVE_MAX");
    assert!(h.try_rug_full("alice", 1, 0, t).is_ok());
}

#[test]
fn rug_min_payout_reverts() {
    let mut h = funded();
    let (pot, fee) = h.view(|c| (c.pot, c.params.rug_fee.0));
    rug_err(&mut h, 1, pot - fee + 1, u128::MAX, "E_PAYOUT_BELOW_MIN");
    assert_eq!(h.try_rug_full("alice", 1, pot - fee, u128::MAX).unwrap(), pot - fee);
}

#[test]
fn rug_insufficient_balance_reverts() {
    let mut h = funded();
    h.buy("bob", 100_000_000_000_000_000_000_000);
    assert_err(h.try_rug("bob"), "E_INSUFFICIENT_TOKENS");
}

#[test]
fn rug_burns_exactly_t() {
    let mut h = funded();
    let (bal, s, t) = h.view(|c| (c.balance_of(&acct("alice")), c.token.total_supply, c.t_required()));
    h.rug("alice");
    assert_eq!(h.balance_of("alice"), bal - t);
    assert_eq!(h.view(|c| c.token.total_supply), s - t);
}

#[test]
fn rug_zeroes_pot_and_advances_round() {
    let mut h = funded();
    h.rug("alice");
    let s = h.view(|c| c.get_state());
    assert_eq!(s.pot.0, 0);
    assert_eq!(s.round_id, 2);
    assert_err(h.try_rug("alice"), "E_POT_BELOW_MIN");
}

#[test]
fn rug_updates_hwm_to_max_of_s_and_floor() {
    let mut h = funded();
    let hwm = h.view(|c| c.hwm);
    h.rug("alice");
    let s = h.view(|c| c.token.total_supply);
    assert_eq!(h.view(|c| c.hwm), s.max(hwm * 9000 / 10000));
    // Selling far below the floor, then rugging, decays the floor by 10 % only.
    let bal = h.balance_of("alice");
    h.buy("bob", 3 * NEAR);
    let hwm = h.view(|c| c.hwm);
    h.sell("alice", bal);
    h.rug("bob");
    let s = h.view(|c| c.token.total_supply);
    assert_eq!(h.view(|c| c.hwm), s.max(hwm * 9000 / 10000));
}

#[test]
fn rug_keeps_x_and_reserve() {
    let mut h = funded();
    let (x, reserve) = h.view(|c| (c.x, c.reserve));
    h.rug("alice");
    assert_eq!(h.view(|c| (c.x, c.reserve)), (x, reserve));
}

#[test]
fn rug_appends_record_and_journal() {
    let mut h = funded();
    let (pot, s, t) = h.view(|c| (c.pot, c.token.total_supply, c.t_required()));
    let payout = h.rug("alice");
    let rugs = h.view(|c| c.get_rugs(0, 50));
    assert_eq!(rugs.len(), 1);
    let rec = &rugs[0];
    assert_eq!((rec.round_id, rec.burned.0, rec.payout.0, rec.pot_before.0, rec.supply_before.0), (1, t, payout, pot, s));
    let j = h.view(|c| c.get_journal(0, 100));
    assert_eq!(j.len(), 2);
    assert_eq!(j[1].kind, Kind::Rug);
    assert_eq!(j[1].tokens.0, t);
    assert_eq!(j[1].near.0, payout);
    assert_eq!(j[1].pot_after.0, 0);
}

#[test]
fn failed_payout_journaled_and_credits_pot_minus_journal_fee() {
    let mut h = funded();
    let p = test_params();
    let payout = h.rug("alice");
    h.balance += payout; // the chain returns the failed transfer
    h.on_payout("alice", payout, "rug", false);
    let s = h.view(|c| c.get_state());
    assert_eq!(s.pot.0, payout - p.journal_fee.0);
    let j = h.view(|c| c.get_journal(0, 100));
    let last = j.last().unwrap();
    assert_eq!(last.kind, Kind::PayoutFailed);
    assert_eq!(last.tokens.0, 0);
    assert_eq!(last.near.0, payout - p.journal_fee.0);
    assert_eq!(last.fee.0, p.journal_fee.0);
    assert!(s.surplus.positive);
}

#[test]
fn failed_payout_does_not_return_tokens() {
    let mut h = funded();
    let before = h.balance_of("alice");
    let t = h.view(|c| c.t_required());
    let payout = h.rug("alice");
    h.balance += payout;
    h.on_payout("alice", payout, "rug", false);
    assert_eq!(h.balance_of("alice"), before - t);
}

#[test]
fn on_payout_success_noop() {
    let mut h = funded();
    let (pot, len) = h.view(|c| (c.pot, c.journal.len()));
    h.on_payout("alice", NEAR, "sell", true);
    assert_eq!(h.view(|c| (c.pot, c.journal.len())), (pot, len));
}

/// `#[private]` lives in the generated wasm entry point, so a unit test can only pin the source.
/// `sandbox_private_methods_reject_outsiders` and `scripts/e2e-testnet` exercise the real check.
fn private_attributes() -> Vec<String> {
    let src = include_str!("../lib.rs");
    let lines: Vec<&str> = src.lines().collect();
    lines
        .iter()
        .enumerate()
        .filter(|(_, l)| l.trim() == "#[private]")
        .map(|(i, _)| lines[i + 1].trim().to_string())
        .collect()
}

#[test]
fn on_payout_not_private_callable_rejected() {
    assert!(private_attributes().iter().any(|l| l.starts_with("pub fn on_payout")));
}

#[test]
fn resolve_not_callable_externally() {
    assert!(private_attributes().iter().any(|l| l.starts_with("fn ft_resolve_transfer")));
}

#[test]
fn surplus_serializes_when_negative() {
    let mut h = funded();
    h.balance = 1;
    let s = h.view(|c| c.get_state());
    assert!(!s.surplus.positive);
    let json = serde_json::to_value(&s).unwrap();
    assert_eq!(json["surplus"]["positive"], false);
    assert!(json["surplus"]["abs"].is_string());
}

#[test]
fn insolvent_contract_reverts_trades() {
    let mut h = funded();
    h.balance = 1;
    let err = h.try_buy("alice", NEAR, 0).unwrap_err();
    assert_eq!(code(&err), "E_INSOLVENT");
}

#[test]
fn errors_use_stable_codes() {
    let src = include_str!("../lib.rs");
    let mut count = 0;
    for line in src.lines().filter(|l| l.contains("panic_str(\"")) {
        let msg = line.split("panic_str(\"").nth(1).unwrap();
        assert!(msg.starts_with("E_"), "panic without a stable code: {line}");
        count += 1;
    }
    assert!(count >= 12, "found {count}");
    for code in ["E_ROUND_STALE", "E_POT_BELOW_MIN", "E_BURN_ABOVE_MAX", "E_INSUFFICIENT_TOKENS", "E_PAYOUT_BELOW_MIN", "E_SLIPPAGE", "E_BELOW_MIN_BUY", "E_SELL_TOO_SMALL", "E_ABOVE_X_MAX", "E_UNREGISTER_DISABLED"] {
        assert!(src.contains(code), "{code}");
    }
}

#[test]
fn events_have_the_exact_format() {
    let mut h = Chain::new(test_params());
    h.buy("alice", 5 * NEAR);
    let buy_logs = get_logs();
    assert!(buy_logs[0].starts_with(r#"EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_mint","data":[{"owner_id":"alice.testnet","amount":""#), "{}", buy_logs[0]);
    assert!(buy_logs[0].ends_with(r#","memo":"buy"}]}"#), "{}", buy_logs[0]);
    assert!(buy_logs[1].starts_with(r#"EVENT_JSON:{"standard":"anyone_can_rug","version":"1.0.0","event":"buy","data":[{"seq":0,"account":"alice.testnet","tokens":""#), "{}", buy_logs[1]);
    h.rug("alice");
    let logs = get_logs();
    assert!(logs[0].contains(r#""event":"ft_burn""#) && logs[0].contains(r#""memo":"rug""#), "{}", logs[0]);
    assert!(logs[1].contains(r#""event":"rug","data":[{"seq":1,"round_id":1,"account":"alice.testnet","burned":""#), "{}", logs[1]);
    assert!(logs[1].contains(r#""next_round_id":2,"ts_ms":"#), "{}", logs[1]);
}

#[test]
fn grep_no_admin() {
    // Patterns are assembled so this file does not match itself.
    let forbidden = [
        concat!("predecessor_account_id() ", "=="),
        concat!(" own", "er "),
        concat!("mi", "grate"),
        concat!("ignore", "_state"),
        concat!("deploy", "_contract"),
        concat!("add_full", "_access_key"),
        concat!("add", "_access_key"),
        concat!("delete", "_account"),
    ];
    let files = [include_str!("../lib.rs"), include_str!("../math.rs"), include_str!("../events.rs")];
    for src in files {
        for pat in forbidden {
            assert!(!src.contains(pat), "{pat}");
        }
    }
    assert_eq!(private_attributes().len(), 2);
}
