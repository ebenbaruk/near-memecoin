//! A mocked chain with real revert semantics: every call runs against a snapshot of the trie and
//! of the contract, and a panic restores both, as a failed receipt would.

use std::cell::Cell;
use std::collections::HashMap;
use std::panic::{catch_unwind, set_hook, take_hook, AssertUnwindSafe};
use std::sync::{Once, OnceLock};

use near_sdk::borsh;
use near_sdk::json_types::U128;
use near_sdk::mock::with_mocked_blockchain;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{env, test_vm_config, AccountId, MockedBlockchain, NearToken, PromiseResult, RuntimeFeesConfig};

use crate::{Contract, Params};

pub const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
pub const CONTRACT: &str = "rug.testnet";
pub const REG_MIN: u128 = 1_250_000_000_000_000_000_000;

thread_local! {
    static SILENT: Cell<bool> = const { Cell::new(false) };
}
static HOOK: Once = Once::new();

/// Expected panics stay quiet; every other panic keeps its normal message.
pub fn install_quiet_hook() {
    HOOK.call_once(|| {
        let default = take_hook();
        set_hook(Box::new(move |info| {
            if !SILENT.with(|s| s.get()) {
                default(info);
            }
        }));
    });
}

pub fn acct(name: &str) -> AccountId {
    let id = if name.contains('.') || name.len() == 64 {
        name.to_string()
    } else {
        format!("{name}.testnet")
    };
    id.parse().unwrap()
}

pub fn long_account() -> String {
    "a".repeat(64)
}

/// Live curve with a pot minimum low enough that a single buy opens a round.
pub fn test_params() -> Params {
    Params {
        name: "Anyone Can Rug".into(),
        symbol: "RUGPRICE".into(),
        p0: U128(10_000_000_000_000_000_000),
        a: U128(10_000_000_000_000),
        fee_bps: 200,
        tau_bps: 500,
        hwm_floor_bps: 9000,
        pot_min: U128(10_000_000_000_000_000_000_000),
        min_buy: U128(50_000_000_000_000_000_000_000),
        journal_fee: U128(3_000_000_000_000_000_000_000),
        rug_fee: U128(6_000_000_000_000_000_000_000),
    }
}

fn panic_text(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else {
        "unknown panic".to_string()
    }
}

/// Extracts the stable error code from a panic message.
pub fn code(message: &str) -> String {
    let Some(start) = message.find("E_") else {
        return message.to_string();
    };
    message[start..]
        .chars()
        .take_while(|c| c.is_ascii_uppercase() || *c == '_')
        .collect()
}

pub struct Chain {
    pub c: Contract,
    /// Modelled NEAR balance of the contract account.
    pub balance: u128,
    pub height: u64,
}

impl Chain {
    pub fn new(params: Params) -> Self {
        Self::try_new(params).unwrap_or_else(|e| panic!("init failed: {e}"))
    }

    pub fn try_new(params: Params) -> Result<Self, String> {
        install_quiet_hook();
        let balance = 5 * NEAR;
        install(CONTRACT, 0, balance, 0, 1, HashMap::new(), vec![]);
        SILENT.with(|s| s.set(true));
        let made = catch_unwind(AssertUnwindSafe(|| Contract::new(params)));
        SILENT.with(|s| s.set(false));
        match made {
            Ok(c) => Ok(Self { c, balance: balance + 3 * NEAR, height: 1 }),
            Err(p) => Err(panic_text(p)),
        }
    }

    fn set_env(&self, who: &str, deposit: u128, storage: HashMap<Vec<u8>, Vec<u8>>, usage: u64, results: Vec<PromiseResult>) {
        install(who, deposit, self.balance + deposit, usage, self.height, storage, results);
    }

    /// Runs one receipt. Returns the value, or the panic text after restoring the old state.
    pub fn call<R>(
        &mut self,
        who: &str,
        deposit: u128,
        results: Vec<PromiseResult>,
        f: impl FnOnce(&mut Contract) -> R,
    ) -> Result<R, String> {
        self.height += 1;
        self.c.journal.flush();
        self.c.rugs.flush();
        let usage = env::storage_usage();
        let bytes = borsh::to_vec(&self.c).unwrap();
        let storage = with_mocked_blockchain(|b| b.take_storage());
        let saved = storage.clone();
        self.set_env(who, deposit, storage, usage, results);

        SILENT.with(|s| s.set(true));
        let run = catch_unwind(AssertUnwindSafe(|| f(&mut self.c)));
        SILENT.with(|s| s.set(false));
        match run {
            Ok(v) => {
                self.balance += deposit;
                Ok(v)
            }
            Err(p) => {
                let restored: Contract = borsh::from_slice(&bytes).unwrap();
                // The stale contract must not flush into the restored trie when it drops.
                std::mem::forget(std::mem::replace(&mut self.c, restored));
                self.set_env(who, 0, saved, usage, vec![]);
                Err(panic_text(p))
            }
        }
    }

    /// Runs a view against the current balance.
    pub fn view<R>(&mut self, f: impl FnOnce(&Contract) -> R) -> R {
        self.c.journal.flush();
        self.c.rugs.flush();
        let usage = env::storage_usage();
        let storage = with_mocked_blockchain(|b| b.take_storage());
        self.set_env("viewer.testnet", 0, storage, usage, vec![]);
        f(&self.c)
    }

    pub fn try_buy(&mut self, who: &str, deposit: u128, min_out: u128) -> Result<u128, String> {
        let id = acct(who);
        self.call(id.as_str(), deposit, vec![], |c| c.buy(U128(min_out)).0)
    }

    pub fn buy(&mut self, who: &str, deposit: u128) -> u128 {
        self.try_buy(who, deposit, 0).unwrap_or_else(|e| panic!("buy failed: {e}"))
    }

    pub fn try_sell(&mut self, who: &str, amount: u128, min_out: u128) -> Result<u128, String> {
        let id = acct(who);
        let payout = self.view(|c| c.quote_sell(U128(amount)).0);
        self.call(id.as_str(), 1, vec![], |c| {
            let _ = c.sell(U128(amount), U128(min_out));
        })?;
        self.balance -= payout;
        Ok(payout)
    }

    pub fn sell(&mut self, who: &str, amount: u128) -> u128 {
        self.try_sell(who, amount, 0).unwrap_or_else(|e| panic!("sell failed: {e}"))
    }

    pub fn try_rug_full(&mut self, who: &str, round: u64, min_payout: u128, max_burn: u128) -> Result<u128, String> {
        let id = acct(who);
        let (pot, rug_fee) = self.view(|c| (c.pot, c.params.rug_fee.0));
        self.call(id.as_str(), 1, vec![], |c| {
            let _ = c.rug(round, U128(min_payout), U128(max_burn));
        })?;
        let payout = pot - rug_fee;
        self.balance -= payout;
        Ok(payout)
    }

    pub fn try_rug(&mut self, who: &str) -> Result<u128, String> {
        let round = self.view(|c| c.round_id);
        self.try_rug_full(who, round, 0, u128::MAX)
    }

    pub fn rug(&mut self, who: &str) -> u128 {
        self.try_rug(who).unwrap_or_else(|e| panic!("rug failed: {e}"))
    }

    /// `buy` then `rug` in one receipt: if the rug fails, the buy is undone too.
    pub fn try_buy_rug(&mut self, who: &str, deposit: u128, min_out: u128, round: u64, min_payout: u128, max_burn: u128) -> Result<(u128, u128), String> {
        let id = acct(who);
        let rug_fee = self.view(|c| c.params.rug_fee.0);
        let mut payout = 0;
        let minted = self.call(id.as_str(), deposit, vec![], |c| {
            let minted = c.buy(U128(min_out)).0;
            payout = c.pot.saturating_sub(rug_fee);
            testing_set_deposit(1);
            let _ = c.rug(round, U128(min_payout), U128(max_burn));
            minted
        })?;
        self.balance = self.balance + 1 - payout;
        Ok((minted, payout))
    }

    pub fn try_transfer(&mut self, from: &str, to: &str, amount: u128) -> Result<(), String> {
        use near_contract_standards::fungible_token::core::FungibleTokenCore;
        let id = acct(from);
        let to = acct(to);
        self.call(id.as_str(), 1, vec![], |c| c.ft_transfer(to, U128(amount), None))
    }

    pub fn on_payout(&mut self, who: &str, amount: u128, kind: &str, success: bool) {
        let result = if success { PromiseResult::Successful(vec![]) } else { PromiseResult::Failed };
        let id = acct(who);
        self.call(CONTRACT, 0, vec![result], |c| c.on_payout(id, U128(amount), kind.into())).unwrap();
    }

    pub fn balance_of(&mut self, who: &str) -> u128 {
        let id = acct(who);
        self.view(|c| c.balance_of(&id))
    }
}

/// Inside one receipt the second action of a batch sees its own deposit.
pub fn testing_set_deposit(amount: u128) {
    let usage = env::storage_usage();
    let balance = env::account_balance().as_yoctonear();
    let who = env::predecessor_account_id();
    let height = env::block_height();
    let storage = with_mocked_blockchain(|b| b.take_storage());
    install(who.as_str(), amount, balance + amount, usage, height, storage, vec![]);
}

/// Building the VM config parses the whole runtime config: once per process is enough.
fn vm_config() -> near_parameters::vm::Config {
    static CONFIG: OnceLock<near_parameters::vm::Config> = OnceLock::new();
    CONFIG.get_or_init(test_vm_config).clone()
}

fn install(who: &str, deposit: u128, balance: u128, usage: u64, height: u64, storage: HashMap<Vec<u8>, Vec<u8>>, results: Vec<PromiseResult>) {
    let context = VMContextBuilder::new()
        .current_account_id(CONTRACT.parse().unwrap())
        .signer_account_id(who.parse().unwrap())
        .predecessor_account_id(who.parse().unwrap())
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_yoctonear(balance))
        .storage_usage(usage)
        .block_height(height)
        .block_timestamp(height * 1_000_000_000)
        .build();
    env::set_blockchain_interface(MockedBlockchain::new(
        context,
        vm_config(),
        RuntimeFeesConfig::test(),
        results,
        storage,
        HashMap::new(),
        None,
    ));
}

pub fn assert_err<T: std::fmt::Debug>(r: Result<T, String>, expected: &str) {
    match r {
        Ok(v) => panic!("expected {expected}, got success: {v:?}"),
        Err(e) => assert_eq!(code(&e), expected, "full message: {e}"),
    }
}
