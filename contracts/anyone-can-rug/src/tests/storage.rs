use near_contract_standards::fungible_token::metadata::FungibleTokenMetadataProvider;
use near_contract_standards::storage_management::StorageManagement;
use near_sdk::{env, NearToken};

use super::harness::*;
use crate::math::ONE;

#[test]
fn ft_transfer_requires_registered() {
    let mut h = Chain::new(test_params());
    h.buy("alice", NEAR);
    let err = h.try_transfer("alice", "ghost", ONE).unwrap_err();
    assert!(err.contains("not registered"), "{err}");
}

#[test]
fn transfer_does_not_change_x_or_s() {
    let mut h = Chain::new(test_params());
    h.buy("alice", NEAR);
    h.buy("bob", NEAR);
    let before = h.view(|c| (c.x, c.token.total_supply, c.pot, c.reserve));
    h.try_transfer("alice", "bob", ONE).unwrap();
    assert_eq!(h.view(|c| (c.x, c.token.total_supply, c.pot, c.reserve)), before);
}

#[test]
fn register_twice_is_noop() {
    let mut h = Chain::new(test_params());
    let id = acct("carol");
    let dep = REG_MIN;
    h.call(id.as_str(), dep, vec![], |c| { let _ = c.storage_deposit(None, None); }).unwrap();
    h.balance -= 0;
    let usage = h.view(|_| env::storage_usage());
    h.call(id.as_str(), dep, vec![], |c| { let _ = c.storage_deposit(None, None); }).unwrap();
    assert_eq!(h.view(|_| env::storage_usage()), usage);
}

#[test]
fn storage_unregister_always_panics() {
    let mut h = Chain::new(test_params());
    h.buy("alice", NEAR);
    for (who, force) in [("alice", Some(true)), ("alice", Some(false)), ("alice", None), ("ghost", None)] {
        let id = acct(who);
        let err = h.call(id.as_str(), 1, vec![], |c| c.storage_unregister(force)).unwrap_err();
        assert_eq!(code(&err), "E_UNREGISTER_DISABLED");
    }
}

fn entry_cost(h: &mut Chain, f: impl FnOnce(&mut Chain)) -> u128 {
    let before = h.view(|_| env::storage_usage());
    f(h);
    let after = h.view(|_| env::storage_usage());
    (after - before) as u128 * env::storage_byte_cost().as_yoctonear()
}

#[test]
fn journal_fee_covers_64_char_account() {
    let mut h = Chain::new(test_params());
    let p = test_params();
    let long = long_account();
    h.buy(&long, NEAR);
    let cost = entry_cost(&mut h, |h| { h.buy(&long, NEAR); });
    assert!(cost > 0, "flush missing");
    assert!(cost <= p.journal_fee.0, "{cost}");
    let cost = entry_cost(&mut h, |h| { h.sell(&long, ONE * 1000); });
    assert!(cost > 0 && cost <= p.journal_fee.0, "{cost}");
}

#[test]
fn rug_fee_covers_64_char_account() {
    let mut h = Chain::new(test_params());
    let p = test_params();
    let long = long_account();
    h.buy(&long, 5 * NEAR);
    let cost = entry_cost(&mut h, |h| { h.rug(&long); });
    assert!(cost > 0 && cost <= p.rug_fee.0, "{cost}");
}

#[test]
fn registration_deposit_covers_64_char_account() {
    let mut h = Chain::new(test_params());
    let long = long_account();
    let id = acct(&long);
    let cost = entry_cost(&mut h, |h| {
        h.call(id.as_str(), REG_MIN, vec![], |c| { let _ = c.storage_deposit(None, None); }).unwrap();
    });
    assert_eq!(cost, REG_MIN);
    let bound = h.view(|c| c.storage_balance_bounds().min);
    assert_eq!(bound, NearToken::from_yoctonear(REG_MIN));
}

#[test]
fn metadata_is_nep148_valid() {
    let mut h = Chain::new(test_params());
    let m = h.view(|c| c.ft_metadata());
    m.assert_valid();
    assert_eq!((m.spec.as_str(), m.decimals, m.symbol.as_str(), m.name.as_str()), ("ft-1.0.0", 18, "RUGPRICE", "Anyone Can Rug"));
    assert!(m.icon.unwrap().starts_with("data:image/svg+xml,"));
}

#[test]
fn journal_pagination_bounds() {
    let mut h = Chain::new(test_params());
    for _ in 0..5 { h.buy("alice", NEAR); }
    assert_eq!(h.view(|c| c.get_journal_len()), 5);
    assert_eq!(h.view(|c| c.get_journal(3, 10)).len(), 2);
    assert_eq!(h.view(|c| c.get_journal(5, 10)).len(), 0);
    assert_eq!(h.view(|c| c.get_journal(99, 10)).len(), 0);
}

#[test]
fn journal_limit_capped_at_100() {
    let mut h = Chain::new(test_params());
    for _ in 0..105 { h.buy("alice", NEAR / 10); }
    assert_eq!(h.view(|c| c.get_journal(0, 1000)).len(), 100);
    assert_eq!(h.view(|c| c.get_journal(100, 1000)).len(), 5);
}

#[test]
fn rugs_pagination() {
    let mut h = Chain::new(test_params());
    for _ in 0..3 { h.buy("alice", 5 * NEAR); h.rug("alice"); }
    assert_eq!(h.view(|c| c.get_rugs_len()), 3);
    assert_eq!(h.view(|c| c.get_rugs(1, 1)).len(), 1);
    assert_eq!(h.view(|c| c.get_rugs(1, 1))[0].round_id, 2);
    assert_eq!(h.view(|c| c.get_rugs(0, 999)).len(), 3);
}
