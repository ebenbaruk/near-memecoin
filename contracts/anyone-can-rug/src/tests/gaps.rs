use near_sdk::json_types::U128;

use super::harness::*;
use crate::math::{self, ONE};

fn setup() -> Chain {
    let mut h = Chain::new(test_params());
    h.buy("alice", 5 * NEAR);
    h.buy("bob", 2 * NEAR);
    h
}

#[test]
fn gap_holder_infeasible_when_t_gt_s() {
    let mut h = Chain::new(test_params());
    h.buy("alice", 5 * NEAR);
    h.rug("alice");
    let bal = h.balance_of("alice");
    h.buy("bob", 5 * NEAR);
    let bob = h.balance_of("bob");
    h.sell("bob", bob);
    h.sell("alice", bal);
    let view = h.view(|c| c.get_gap_holder());
    assert!(view.t_required.0 > 0);
    assert_eq!(h.view(|c| c.token.total_supply), 0);
    assert!(!view.feasible);
}

#[test]
fn gap_holder_value_matches_sell_vs_rug() {
    let mut h = setup();
    let v = h.view(|c| c.get_gap_holder());
    assert!(v.feasible);
    let (x, pot, fee_bps, rug_fee) = h.view(|c| (c.x, c.pot, c.params.fee_bps, c.params.rug_fee.0));
    let c = h.view(|c| c.curve());
    let sold = math::net_sell(c, x, v.t_required.0, fee_bps);
    let (positive, abs) = math::signed(pot - rug_fee, sold);
    assert_eq!((v.positive, v.abs.0), (positive, abs));
}

#[test]
fn gap_buy_value_matches_real_batch() {
    let mut h = setup();
    let v = h.view(|c| c.get_gap_buy(Some(acct("carol"))));
    assert!(v.feasible);
    let round = h.view(|c| c.round_id);
    let before = h.balance;
    let (minted, payout) = h
        .try_buy_rug("carol", v.deposit_needed.0, v.min_out.0, round, 0, v.t_required.0)
        .unwrap();
    assert_eq!(minted, v.min_out.0);
    let (positive, abs) = math::signed(payout + 1, v.deposit_needed.0 + 1);
    assert_eq!((v.positive, v.abs.0), (positive, abs));
    // Contract balance moves by what carol put in minus what she took out, plus the 1-yocto rug deposit.
    assert_eq!(h.balance, before + v.deposit_needed.0 + 1 - payout);
}

#[test]
fn gap_buy_deposit_needed_is_sufficient() {
    for (who, spend) in [("carol", NEAR), ("dave", 3 * NEAR), ("erin", NEAR / 10)] {
        let mut h = setup();
        h.buy("alice", spend);
        let v = h.view(|c| c.get_gap_buy(Some(acct(who))));
        let round = h.view(|c| c.round_id);
        h.try_buy_rug(who, v.deposit_needed.0, v.min_out.0, round, 0, v.t_required.0)
            .unwrap_or_else(|e| panic!("{who}: {e}"));
    }
}

#[test]
fn gap_buy_accounts_for_existing_balance() {
    let mut h = setup();
    let empty = h.view(|c| c.get_gap_buy(Some(acct("carol"))));
    let holder = h.view(|c| c.get_gap_buy(Some(acct("bob"))));
    assert!(holder.deposit_needed.0 <= empty.deposit_needed.0);
    // Bob already holds more than T: only the minimum buy remains.
    let p = test_params();
    assert_eq!(holder.deposit_needed.0, p.min_buy.0 + p.journal_fee.0);
    assert_eq!(holder.tokens_needed.0, 0);
}

#[test]
fn gap_buy_quotes_small_deposits_without_panicking() {
    let mut h = Chain::new(test_params());
    let v = h.view(|c| c.get_gap_buy(None));
    assert!(!v.feasible || v.deposit_needed.0 > 0);
    assert!(v.deposit_needed.0 >= test_params().min_buy.0);
}

#[test]
fn gap_exit_value_matches_real_sequence() {
    let mut h = setup();
    let v = h.view(|c| c.get_gap_exit(acct("alice")));
    assert!(v.feasible);
    let w = h.balance_of("alice");
    let (s0, hwm, tau, floor, c, x0, fee_bps) = h.view(|c| {
        (c.token.total_supply, c.hwm, c.params.tau_bps, c.params.hwm_floor_bps, c.curve(), c.x, c.params.fee_bps)
    });
    let sold = math::gap_exit_s(s0, hwm, w, tau, floor);
    // Alternative: dump everything.
    let all_out = math::net_sell(c, x0, w, fee_bps);
    // Real sequence: sell the exit size (the fee lands in the pot), then rug with what is left.
    let jf = test_params().journal_fee.0;
    let got = h.sell("alice", sold) + jf;
    let payout = h.rug("alice");
    let (positive, abs) = math::signed(got + payout, all_out);
    assert_eq!((v.positive, v.abs.0), (positive, abs));
}

#[test]
fn gap_exit_leaves_exactly_enough() {
    let mut h = setup();
    let w = h.balance_of("alice");
    let (s, hwm, tau, floor) = h.view(|c| (c.token.total_supply, c.hwm, c.params.tau_bps, c.params.hwm_floor_bps));
    let sold = math::gap_exit_s(s, hwm, w, tau, floor);
    h.sell("alice", sold);
    let left = h.balance_of("alice");
    assert!(left >= h.view(|c| c.t_required()));
    assert!(left - h.view(|c| c.t_required()) <= 1);
    h.rug("alice");
}

#[test]
fn gaps_report_negative_correctly() {
    // Fresh curve, tiny fee income: stealing the pot costs far more than it pays.
    let mut h = Chain::new(test_params());
    h.buy("alice", 40 * NEAR);
    let v = h.view(|c| c.get_gap_buy(None));
    assert!(v.feasible);
    assert!(!v.positive);
    assert!(v.abs.0 > NEAR / 10);
    let holder = h.view(|c| c.get_gap_holder());
    assert!(!holder.positive);
    assert!(h.view(|c| c.quote_buy(U128(1), None).0) == 0);
    assert!(h.view(|c| c.quote_sell(U128(10_000 * ONE)).0) > 0);
}
