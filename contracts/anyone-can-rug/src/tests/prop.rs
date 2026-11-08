//! Random sequences of buy/sell/rug/transfer from five accounts, with the invariants checked
//! after every operation.

use proptest::prelude::*;
use proptest::test_runner::{Config, TestRunner};

use super::harness::*;
use crate::math::{self, ONE};
use crate::Kind;

const WHO: [&str; 5] = ["alice", "bob", "carol", "dave", "erin"];

#[derive(Clone, Debug)]
enum Op {
    Buy { who: usize, milli: u64 },
    Sell { who: usize, bps: u32 },
    Rug { who: usize },
    BuyRug { who: usize },
    Transfer { from: usize, to: usize, bps: u32 },
}

fn op() -> impl Strategy<Value = Op> {
    prop_oneof![
        5 => (0..5usize, 60..8000u64).prop_map(|(who, milli)| Op::Buy { who, milli }),
        3 => (0..5usize, 1..=10_000u32).prop_map(|(who, bps)| Op::Sell { who, bps }),
        2 => (0..5usize).prop_map(|who| Op::Rug { who }),
        1 => (0..5usize).prop_map(|who| Op::BuyRug { who }),
        1 => (0..5usize, 0..5usize, 1..=10_000u32).prop_map(|(from, to, bps)| Op::Transfer { from, to, bps }),
    ]
}

fn runner(cases: u32) -> TestRunner {
    TestRunner::new(Config { cases, failure_persistence: None, ..Config::default() })
}

fn apply(h: &mut Chain, op: &Op, burned_total: &mut u128) {
    match *op {
        Op::Buy { who, milli } => {
            let _ = h.try_buy(WHO[who], milli as u128 * NEAR / 1000, 0);
        }
        Op::Sell { who, bps } => {
            let amount = h.balance_of(WHO[who]) * bps as u128 / 10_000;
            let _ = h.try_sell(WHO[who], amount, 0);
        }
        Op::Rug { who } => {
            let t = h.view(|c| c.t_required());
            if h.try_rug(WHO[who]).is_ok() {
                *burned_total += t;
            }
        }
        Op::BuyRug { who } => {
            let v = h.view(|c| c.get_gap_buy(Some(acct(WHO[who]))));
            let round = h.view(|c| c.round_id);
            if v.feasible && h.try_buy_rug(WHO[who], v.deposit_needed.0, v.min_out.0, round, 0, v.t_required.0).is_ok() {
                *burned_total += v.t_required.0;
            }
        }
        Op::Transfer { from, to, bps } => {
            let amount = h.balance_of(WHO[from]) * bps as u128 / 10_000;
            let _ = h.try_transfer(WHO[from], WHO[to], amount);
        }
    }
}

fn check(h: &mut Chain, burned_total: u128, last_hwm: &mut u128, last_round: &mut u64, was_rug: bool) {
    let s = h.view(|c| c.get_state());
    let c = h.view(|c| c.curve());
    // prop_reserve_equals_r_x
    assert_eq!(s.reserve.0, math::r(c, s.x.0));
    // prop_x_eq_s_plus_burned
    assert!(s.x.0 >= s.supply.0);
    assert_eq!(s.x.0 - s.supply.0, burned_total);
    // prop_solvent
    assert!(s.surplus.positive, "insolvent by {}", s.surplus.abs.0);
    // prop_supply_is_sum_of_balances
    let sum: u128 = WHO.iter().map(|w| h.balance_of(w)).sum();
    assert_eq!(sum, s.supply.0);
    // prop_hwm_monotone_except_rug, prop_hwm_ge_s
    assert!(s.hwm.0 >= s.supply.0);
    if !was_rug {
        assert!(s.hwm.0 >= *last_hwm);
    }
    *last_hwm = s.hwm.0;
    // prop_round_id_never_regresses
    assert!(s.round_id >= *last_round);
    *last_round = s.round_id;
}

/// Replays the whole journal into supply and pot.
fn replay(h: &mut Chain) -> (u128, u128) {
    let len = h.view(|c| c.get_journal_len());
    let (mut supply, mut pot) = (0u128, 0u128);
    let mut from = 0;
    while from < len {
        for e in h.view(|c| c.get_journal(from, 100)) {
            match e.kind {
                Kind::Buy => {
                    supply += e.tokens.0;
                    pot += e.fee.0;
                }
                Kind::Sell => {
                    supply -= e.tokens.0;
                    pot += e.fee.0;
                }
                Kind::Rug => {
                    supply -= e.tokens.0;
                    pot = 0;
                }
                Kind::PayoutFailed => pot += e.near.0,
            }
            assert_eq!(e.supply_after.0, supply);
            assert_eq!(e.pot_after.0, pot);
        }
        from += 100;
    }
    (supply, pot)
}

fn p2(cases: u32, seq_len: usize, body: impl Fn(Vec<Op>) -> Result<(), TestCaseError>) {
    runner(cases)
        .run(&prop::collection::vec(op(), 5..seq_len), body)
        .unwrap();
}

#[test]
fn prop_invariants_hold_on_random_sequences() {
    p2(256, 40, |ops| {
        let mut h = Chain::new(test_params());
        let (mut burned, mut hwm, mut round) = (0, 0, 1);
        for op in &ops {
            let rugs = h.view(|c| c.get_rugs_len());
            apply(&mut h, op, &mut burned);
            let was_rug = h.view(|c| c.get_rugs_len()) != rugs;
            check(&mut h, burned, &mut hwm, &mut round, was_rug);
        }
        // prop_supply_matches_journal, prop_pot_matches_journal
        let (supply, pot) = replay(&mut h);
        let s = h.view(|c| c.get_state());
        prop_assert_eq!(supply, s.supply.0);
        prop_assert_eq!(pot, s.pot.0);
        Ok(())
    });
}

#[test]
fn prop_round_trip_loses_exactly_fees() {
    runner(256)
        .run(&(prop::collection::vec(op(), 0..15), 100..20_000u64), |(ops, milli)| {
            let mut h = Chain::new(test_params());
            let p = test_params();
            let mut burned = 0;
            for op in &ops {
                apply(&mut h, op, &mut burned);
            }
            let deposit = milli as u128 * NEAR / 1000;
            let registered = h.balance_of("zed") > 0 || h.view(|c| c.token.accounts.contains_key(&acct("zed")));
            let reserve_before = h.view(|c| c.reserve);
            let minted = h.buy("zed", deposit);
            let cost = h.view(|c| c.reserve) - reserve_before;
            let charges = p.journal_fee.0 + if registered { 0 } else { REG_MIN };
            let after = deposit - charges;
            let buy_fee = math::fee_ceil(after, p.fee_bps);
            let dust = after - buy_fee - cost;
            let payout = h.sell("zed", minted);
            let sell_fee = math::fee_ceil(cost, p.fee_bps);
            prop_assert_eq!(payout, cost - sell_fee - p.journal_fee.0);
            prop_assert_eq!(deposit - payout, charges + buy_fee + dust + sell_fee + p.journal_fee.0);
            prop_assert!(dust < 50_000_000);
            Ok(())
        })
        .unwrap();
}

#[test]
fn prop_split_buy_no_advantage() {
    runner(256)
        .run(&(prop::collection::vec(op(), 0..12), 60..5000u64, 60..5000u64), |(ops, a, b)| {
            let p = test_params();
            let (a, b) = (a as u128 * NEAR / 1000, b as u128 * NEAR / 1000);
            // The mocked trie is per thread, so the two histories run one after the other.
            let run = |buys: &[u128]| {
                let mut h = Chain::new(test_params());
                let mut burned = 0;
                for op in &ops {
                    apply(&mut h, op, &mut burned);
                }
                h.buy("zed", NEAR);
                buys.iter().map(|d| h.buy("zed", *d)).sum::<u128>()
            };
            let split = run(&[a, b]);
            let combined = run(&[a + b - p.journal_fee.0]);
            prop_assert!(split <= combined, "split {} combined {}", split, combined);
            Ok(())
        })
        .unwrap();
}

#[test]
fn prop_no_free_rug() {
    runner(256)
        .run(&(prop::collection::vec(op(), 3..25), 900..4000u64), |(ops, scale)| {
            let mut h = Chain::new(test_params());
            let mut burned = 0;
            for op in &ops {
                apply(&mut h, op, &mut burned);
            }
            let v = h.view(|c| c.get_gap_buy(Some(acct("zed"))));
            if !v.feasible {
                return Ok(());
            }
            let c = h.view(|c| c.curve());
            let x = h.view(|c| c.x);
            let margin = math::r(c, x + ONE / c.a + 4) - math::r(c, x) + 1;
            let bound = if v.positive { v.abs.0 } else { 0 } + margin;
            let round = h.view(|c| c.round_id);
            let deposit = v.deposit_needed.0 * scale as u128 / 1000;
            let Ok((_, payout)) = h.try_buy_rug("zed", deposit, 0, round, 0, u128::MAX) else {
                return Ok(());
            };
            let mut out = payout;
            let left = h.balance_of("zed");
            if left > 0 {
                if let Ok(sold) = h.try_sell("zed", left, 0) {
                    out += sold;
                }
            }
            let gain = out.saturating_sub(deposit);
            prop_assert!(gain <= bound, "gain {} above bound {}", gain, bound);
            Ok(())
        })
        .unwrap();
}

#[test]
fn prop_gap_buy_rug_always_succeeds() {
    p2(256, 30, |ops| {
        let mut h = Chain::new(test_params());
        let mut burned = 0;
        for op in &ops {
            apply(&mut h, op, &mut burned);
        }
        for who in ["alice", "zed"] {
            let v = h.view(|c| c.get_gap_buy(Some(acct(who))));
            if v.feasible {
                let round = h.view(|c| c.round_id);
                let tried = h.try_buy_rug(who, v.deposit_needed.0, v.min_out.0, round, 0, v.t_required.0);
                prop_assert!(tried.is_ok(), "{:?}", tried);
                break;
            }
        }
        Ok(())
    });
}
