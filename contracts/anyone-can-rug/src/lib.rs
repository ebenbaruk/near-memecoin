//! Anyone Can Rug ($RUGPRICE): a NEP-141 token on a linear bonding curve. Every trade pays a
//! fee into a pot; anyone who burns the printed share of the supply takes the pot and a new
//! round starts. There is no privileged method: parameters are set once by `new`.

mod events;
pub mod math;

#[cfg(test)]
mod tests;

use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::events::{FtBurn, FtMint};
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::resolver::FungibleTokenResolver;
use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::borsh::BorshSerialize;
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U128;
use near_sdk::{
    assert_one_yocto, env, is_promise_success, near, require, store, AccountId, BorshStorageKey,
    Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
};

use events::{PayoutFailedEvent, RugEvent, TradeEvent};
use math::{Curve, BPS, X_MAX};

const TOKEN_ICON: &str = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%2314160D'/%3E%3Crect x='5' y='7' width='22' height='18' fill='%23F0562B' stroke='%23F6EFDC' stroke-width='2'/%3E%3Cpath d='M11 11h10v10H11z' fill='%23F2C230'/%3E%3Cpath d='M16 13l3 3-3 3-3-3z' fill='%233A1D0E'/%3E%3C/svg%3E";

const JOURNAL_LIMIT: u64 = 100;
const RUGS_LIMIT: u64 = 50;
const ON_PAYOUT_GAS: Gas = Gas::from_tgas(10);

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Accounts,
    Metadata,
    Journal,
    Rugs,
}

/// Fixed at `new`. No method writes to it afterwards.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Params {
    pub name: String,
    pub symbol: String,
    /// Yocto per whole token. `0 < p0 <= 1e25`.
    pub p0: U128,
    /// Yocto per whole token per whole token. `0 < a <= 1e20`.
    pub a: U128,
    pub fee_bps: u16,
    pub tau_bps: u16,
    pub hwm_floor_bps: u16,
    pub pot_min: U128,
    pub min_buy: U128,
    pub journal_fee: U128,
    pub rug_fee: U128,
}

#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
    Buy,
    Sell,
    Rug,
    PayoutFailed,
}

/// One line per mint or burn. An entry's index is its position in the journal.
/// `near` and `fee`: Buy = curve cost and fee (with dust); Sell = payout and fee;
/// Rug = payout and `rug_fee`; PayoutFailed = amount credited to the pot and `journal_fee`.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct JournalEntry {
    pub kind: Kind,
    pub account: AccountId,
    pub tokens: U128,
    pub near: U128,
    pub fee: U128,
    pub supply_after: U128,
    pub x_after: U128,
    pub pot_after: U128,
    pub ts_ms: u64,
    pub block: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct RugRecord {
    pub round_id: u64,
    pub rugger: AccountId,
    pub burned: U128,
    pub payout: U128,
    pub pot_before: U128,
    pub supply_before: U128,
    pub x_after: U128,
    pub ts_ms: u64,
    pub block: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Signed {
    pub positive: bool,
    pub abs: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct StateView {
    pub supply: U128,
    pub x: U128,
    pub burned: U128,
    pub reserve: U128,
    pub pot: U128,
    pub hwm: U128,
    pub t_required: U128,
    pub round_id: u64,
    pub rugs_count: u64,
    pub journal_len: u64,
    pub spot_price: U128,
    pub floor_price: U128,
    pub floor_reserve: U128,
    pub balance: U128,
    pub storage_cost: U128,
    pub surplus: Signed,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct GapView {
    pub feasible: bool,
    pub positive: bool,
    pub abs: U128,
    pub tokens_needed: U128,
    pub t_required: U128,
    pub pot: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct GapBuyView {
    pub feasible: bool,
    pub positive: bool,
    pub abs: U128,
    pub tokens_needed: U128,
    pub t_required: U128,
    pub pot: U128,
    pub deposit_needed: U128,
    pub min_out: U128,
    pub cost: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    params: Params,
    /// `token.total_supply` is S, the circulating supply.
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
    /// Curve position in base units. `x == S + burned`.
    x: u128,
    /// Yocto. Always `r(x)`.
    reserve: u128,
    /// Yocto. Pot of the current round.
    pot: u128,
    hwm: u128,
    round_id: u64,
    journal: store::Vector<JournalEntry>,
    rugs: store::Vector<RugRecord>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(params: Params) -> Self {
        let fail = |what: &str| env::panic_str(&format!("E_BAD_PARAMS: {what}"));
        if params.name.is_empty() || params.symbol.is_empty() {
            fail("name and symbol are required");
        }
        if params.p0.0 == 0 || params.p0.0 > 10u128.pow(25) {
            fail("p0 out of range");
        }
        if params.a.0 == 0 || params.a.0 > 10u128.pow(20) {
            fail("a out of range");
        }
        if !(1..=1000).contains(&params.fee_bps) {
            fail("fee_bps out of range");
        }
        if !(1..=5000).contains(&params.tau_bps) {
            fail("tau_bps out of range");
        }
        if params.hwm_floor_bps != 9000 {
            fail("hwm_floor_bps must be 9000");
        }
        if params.min_buy.0 == 0 {
            fail("min_buy must be positive");
        }
        if params.pot_min.0 < params.rug_fee.0 + params.journal_fee.0 {
            fail("pot_min must cover rug_fee and journal_fee");
        }
        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: params.name.clone(),
            symbol: params.symbol.clone(),
            icon: Some(TOKEN_ICON.to_string()),
            reference: None,
            reference_hash: None,
            decimals: 18,
        };
        Self {
            params,
            token: FungibleToken::new(StorageKey::Accounts),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            x: 0,
            reserve: 0,
            pot: 0,
            hwm: 0,
            round_id: 1,
            journal: store::Vector::new(StorageKey::Journal),
            rugs: store::Vector::new(StorageKey::Rugs),
        }
    }

    /// Mints from the curve. The caller is registered automatically if needed.
    #[payable]
    pub fn buy(&mut self, min_out: U128) -> U128 {
        let account = env::predecessor_account_id();
        let attached = env::attached_deposit().as_yoctonear();
        let journal_fee = self.params.journal_fee.0;
        let registered = self.token.accounts.contains_key(&account);
        let reg = if registered { 0 } else { self.reg_min() };
        if attached < reg + journal_fee + self.params.min_buy.0 {
            env::panic_str("E_BELOW_MIN_BUY: deposit after charges is below min_buy");
        }
        let deposit = attached - reg - journal_fee;
        let fee = math::fee_ceil(deposit, self.params.fee_bps);
        let net = deposit - fee;
        let target = self
            .reserve
            .checked_add(net)
            .unwrap_or_else(|| env::panic_str("E_ABOVE_X_MAX: buy above the supply cap"));
        let x2 = math::inv(self.curve(), target);
        if x2 > X_MAX {
            env::panic_str("E_ABOVE_X_MAX: buy above the supply cap");
        }
        if x2 <= self.x {
            env::panic_str("E_BELOW_MIN_BUY: deposit mints nothing");
        }
        let minted = x2 - self.x;
        if minted < min_out.0 {
            env::panic_str("E_SLIPPAGE: min_out not met");
        }
        let reserve_after = math::r(self.curve(), x2);
        let cost = reserve_after - self.reserve;
        let dust = net - cost;

        if !registered {
            self.token.internal_register_account(&account);
        }
        self.reserve = reserve_after;
        self.x = x2;
        self.pot += fee + dust;
        self.token.internal_deposit(&account, minted);
        self.hwm = self.hwm.max(self.token.total_supply);

        let seq = self.push_trade(Kind::Buy, &account, minted, cost, fee + dust);
        FtMint {
            owner_id: &account,
            amount: U128(minted),
            memo: Some("buy"),
        }
        .emit();
        self.trade_event(seq, &account, minted, cost, fee + dust)
            .emit_buy();
        self.assert_solvent(0);
        U128(minted)
    }

    /// Burns `amount` on the curve and pays out the gross minus the fee and the journal fee.
    #[payable]
    pub fn sell(&mut self, amount: U128, min_out: U128) -> Promise {
        assert_one_yocto();
        let account = env::predecessor_account_id();
        let amount = amount.0;
        if amount == 0 {
            env::panic_str("E_SELL_TOO_SMALL: amount is zero");
        }
        if self.balance_of(&account) < amount {
            env::panic_str("E_INSUFFICIENT_TOKENS: balance below amount");
        }
        let gross = self.reserve - math::r(self.curve(), self.x - amount);
        let fee = math::fee_ceil(gross, self.params.fee_bps);
        let journal_fee = self.params.journal_fee.0;
        if gross <= fee + journal_fee || gross - fee - journal_fee < journal_fee {
            env::panic_str("E_SELL_TOO_SMALL: gross does not cover fee and journal fee");
        }
        let payout = gross - fee - journal_fee;
        if payout < min_out.0 {
            env::panic_str("E_SLIPPAGE: min_out not met");
        }

        self.token.internal_withdraw(&account, amount);
        self.x -= amount;
        self.reserve -= gross;
        self.pot += fee;

        let seq = self.push_trade(Kind::Sell, &account, amount, payout, fee);
        FtBurn {
            owner_id: &account,
            amount: U128(amount),
            memo: Some("sell"),
        }
        .emit();
        self.trade_event(seq, &account, amount, payout, fee)
            .emit_sell();
        self.assert_solvent(payout);
        Self::payout(account, payout, "sell")
    }

    /// Burns the printed threshold and takes the pot. `x` and the reserve do not move.
    #[payable]
    pub fn rug(&mut self, round_id: u64, min_payout: U128, max_burn: U128) -> Promise {
        assert_one_yocto();
        let account = env::predecessor_account_id();
        if round_id != self.round_id {
            env::panic_str("E_ROUND_STALE: not the current round");
        }
        if self.pot < self.params.pot_min.0 {
            env::panic_str("E_POT_BELOW_MIN: pot below pot_min");
        }
        let burn = self.t_required();
        require!(burn > 0, "threshold is zero");
        if burn > max_burn.0 {
            env::panic_str("E_BURN_ABOVE_MAX: threshold above max_burn");
        }
        if self.balance_of(&account) < burn {
            env::panic_str("E_INSUFFICIENT_TOKENS: balance below threshold");
        }
        let rug_fee = self.params.rug_fee.0;
        let payout = self.pot - rug_fee;
        if payout < min_payout.0 {
            env::panic_str("E_PAYOUT_BELOW_MIN: payout below min_payout");
        }

        let pot_before = self.pot;
        let supply_before = self.token.total_supply;
        self.token.internal_withdraw(&account, burn);
        self.pot = 0;
        self.hwm = self
            .token
            .total_supply
            .max(math::hwm_floor(self.hwm, self.params.hwm_floor_bps));
        let round = self.round_id;
        self.round_id += 1;

        let ts_ms = env::block_timestamp_ms();
        let block = env::block_height();
        self.rugs.push(RugRecord {
            round_id: round,
            rugger: account.clone(),
            burned: U128(burn),
            payout: U128(payout),
            pot_before: U128(pot_before),
            supply_before: U128(supply_before),
            x_after: U128(self.x),
            ts_ms,
            block,
        });
        let seq = self.push_trade(Kind::Rug, &account, burn, payout, rug_fee);
        FtBurn {
            owner_id: &account,
            amount: U128(burn),
            memo: Some("rug"),
        }
        .emit();
        RugEvent {
            seq,
            round_id: round,
            account: account.clone(),
            burned: U128(burn),
            payout: U128(payout),
            pot_before: U128(pot_before),
            supply: U128(self.token.total_supply),
            x: U128(self.x),
            next_round_id: self.round_id,
            ts_ms,
            block,
        }
        .emit();
        self.assert_solvent(payout);
        Self::payout(account, payout, "rug")
    }

    /// Runs after every payout. If the transfer failed (the account deleted itself mid-flight),
    /// the amount goes to the pot, minus the journal fee that pays for this entry.
    #[private]
    pub fn on_payout(&mut self, account_id: AccountId, amount: U128, kind: String) {
        if is_promise_success() {
            return;
        }
        let journal_fee = self.params.journal_fee.0;
        let credited = amount.0.saturating_sub(journal_fee);
        self.pot = self.pot.saturating_add(credited);
        let seq = self.push_trade(Kind::PayoutFailed, &account_id, 0, credited, journal_fee);
        PayoutFailedEvent {
            seq,
            account: account_id,
            amount: amount,
            kind,
        }
        .emit();
    }

    pub fn get_params(&self) -> Params {
        self.params.clone()
    }

    pub fn get_state(&self) -> StateView {
        let c = self.curve();
        let supply = self.token.total_supply;
        let burned = self.x - supply;
        let balance = env::account_balance().as_yoctonear();
        let storage_cost = env::storage_usage() as u128 * env::storage_byte_cost().as_yoctonear();
        let (positive, abs) = math::signed(balance, self.reserve + self.pot + storage_cost);
        StateView {
            supply: U128(supply),
            x: U128(self.x),
            burned: U128(burned),
            reserve: U128(self.reserve),
            pot: U128(self.pot),
            hwm: U128(self.hwm),
            t_required: U128(self.t_required()),
            round_id: self.round_id,
            rugs_count: self.rugs.len() as u64,
            journal_len: self.journal.len() as u64,
            spot_price: U128(math::price_at(c, self.x)),
            floor_price: U128(math::price_at(c, burned)),
            floor_reserve: U128(math::r(c, burned)),
            balance: U128(balance),
            storage_cost: U128(storage_cost),
            surplus: Signed {
                positive,
                abs: U128(abs),
            },
        }
    }

    /// "I hold at least T: rug, or sell?" Value is what the rug pays above selling those tokens.
    pub fn get_gap_holder(&self) -> GapView {
        let t = self.t_required();
        let s = self.token.total_supply;
        let pot = self.pot;
        let rug_fee = self.params.rug_fee.0;
        let sold = math::net_sell(self.curve(), self.x, t, self.params.fee_bps);
        let (positive, abs) = math::signed(pot, rug_fee + sold);
        GapView {
            feasible: t <= s && pot >= self.params.pot_min.0,
            positive,
            abs: U128(abs),
            tokens_needed: U128(t),
            t_required: U128(t),
            pot: U128(pot),
        }
    }

    /// "I hold what I hold: buy the rest and rug in one transaction." This is the headline Gap.
    pub fn get_gap_buy(&self, account_id: Option<AccountId>) -> GapBuyView {
        let c = self.curve();
        let p = &self.params;
        let s = self.token.total_supply;
        let pot = self.pot;
        let bal = account_id.as_ref().map_or(0, |a| self.balance_of(a));
        let registered = account_id
            .as_ref()
            .is_some_and(|a| self.token.accounts.contains_key(a));
        let reg = if registered { 0 } else { self.reg_min() };
        let journal_fee = p.journal_fee.0;
        let charges = journal_fee + reg;

        let dx = math::gap_buy_dx(c, s, self.hwm, bal, p.tau_bps, p.hwm_floor_bps);
        let infeasible = GapBuyView {
            feasible: false,
            positive: false,
            abs: U128(0),
            tokens_needed: U128(0),
            t_required: U128(self.t_required()),
            pot: U128(pot),
            deposit_needed: U128(0),
            min_out: U128(0),
            cost: U128(0),
        };
        let net_needed = math::r(c, self.x + dx) - self.reserve + 1;
        let gross_up = math::mul_div_ceil(net_needed, BPS, BPS - p.fee_bps as u128);
        let deposit_needed = (gross_up + charges).max(p.min_buy.0 + charges);
        let deposit = deposit_needed - charges;
        let fee = math::fee_ceil(deposit, p.fee_bps);
        let net = deposit - fee;
        let Some(target) = self.reserve.checked_add(net) else {
            return infeasible;
        };
        let x2 = math::inv(c, target);
        let minted = x2 - self.x;
        let cost_real = math::r(c, x2) - self.reserve;
        let dust = net - cost_real;
        let s_after = s + minted;
        let t = math::t_required(
            s_after,
            self.hwm.max(s_after),
            p.tau_bps,
            p.hwm_floor_bps,
        );
        let (positive, abs) = math::signed(pot, p.rug_fee.0 + cost_real + charges);
        GapBuyView {
            feasible: self.x + dx <= X_MAX && x2 <= X_MAX && pot + fee + dust >= p.pot_min.0,
            positive,
            abs: U128(abs),
            tokens_needed: U128(t.saturating_sub(bal)),
            t_required: U128(t),
            pot: U128(pot),
            deposit_needed: U128(deposit_needed),
            min_out: U128(minted),
            cost: U128(cost_real + charges),
        }
    }

    /// The largest holder's choice: sell everything, or sell what it can and rug with the rest.
    pub fn get_gap_exit(&self, account_id: AccountId) -> GapView {
        let c = self.curve();
        let p = &self.params;
        let s = self.token.total_supply;
        let pot = self.pot;
        let t = self.t_required();
        let w = self.balance_of(&account_id);
        let sold = math::gap_exit_s(s, self.hwm, w, p.tau_bps, p.hwm_floor_bps);
        let net = math::net_sell(c, self.x, sold, p.fee_bps);
        let fee = math::sell_fee(c, self.x, sold, p.fee_bps);
        let all_out = math::net_sell(c, self.x, w, p.fee_bps);
        let (positive, abs) = math::signed(net + fee + pot, p.rug_fee.0 + all_out);
        GapView {
            feasible: w >= t && pot >= p.pot_min.0,
            positive,
            abs: U128(abs),
            tokens_needed: U128(t),
            t_required: U128(t),
            pot: U128(pot),
        }
    }

    pub fn get_rugs(&self, from_index: u64, limit: u64) -> Vec<RugRecord> {
        self.rugs
            .iter()
            .skip(from_index as usize)
            .take(limit.min(RUGS_LIMIT) as usize)
            .cloned()
            .collect()
    }

    pub fn get_rugs_len(&self) -> u64 {
        self.rugs.len() as u64
    }

    pub fn get_journal(&self, from_index: u64, limit: u64) -> Vec<JournalEntry> {
        self.journal
            .iter()
            .skip(from_index as usize)
            .take(limit.min(JOURNAL_LIMIT) as usize)
            .cloned()
            .collect()
    }

    pub fn get_journal_len(&self) -> u64 {
        self.journal.len() as u64
    }

    /// Tokens `buy` would mint for this deposit, or 0 if the deposit is too small.
    /// Without an account, registration is assumed to be needed.
    pub fn quote_buy(&self, near_in: U128, account_id: Option<AccountId>) -> U128 {
        let p = &self.params;
        let registered = account_id
            .as_ref()
            .is_some_and(|a| self.token.accounts.contains_key(a));
        let reg = if registered { 0 } else { self.reg_min() };
        let charges = reg + p.journal_fee.0;
        if near_in.0 < charges + p.min_buy.0 {
            return U128(0);
        }
        let deposit = near_in.0 - charges;
        let net = deposit - math::fee_ceil(deposit, p.fee_bps);
        let Some(target) = self.reserve.checked_add(net) else {
            return U128(0);
        };
        let x2 = math::inv(self.curve(), target);
        if x2 > X_MAX || x2 <= self.x {
            return U128(0);
        }
        U128(x2 - self.x)
    }

    /// Payout of `sell` for this amount, or 0 if the sale would be refused.
    pub fn quote_sell(&self, amount: U128) -> U128 {
        let amount = amount.0;
        if amount == 0 || amount > self.token.total_supply {
            return U128(0);
        }
        let p = &self.params;
        let gross = self.reserve - math::r(self.curve(), self.x - amount);
        let fee = math::fee_ceil(gross, p.fee_bps);
        if gross <= fee + p.journal_fee.0 || gross - fee - p.journal_fee.0 < p.journal_fee.0 {
            return U128(0);
        }
        U128(gross - fee - p.journal_fee.0)
    }
}

impl Contract {
    fn curve(&self) -> Curve {
        Curve {
            p0: self.params.p0.0,
            a: self.params.a.0,
        }
    }

    fn t_required(&self) -> u128 {
        math::t_required(
            self.token.total_supply,
            self.hwm,
            self.params.tau_bps,
            self.params.hwm_floor_bps,
        )
    }

    fn reg_min(&self) -> u128 {
        self.token.storage_balance_bounds().min.as_yoctonear()
    }

    fn balance_of(&self, account: &AccountId) -> u128 {
        self.token.accounts.get(account).unwrap_or(0)
    }

    fn push_trade(&mut self, kind: Kind, account: &AccountId, tokens: u128, near: u128, fee: u128) -> u64 {
        self.journal.push(JournalEntry {
            kind,
            account: account.clone(),
            tokens: U128(tokens),
            near: U128(near),
            fee: U128(fee),
            supply_after: U128(self.token.total_supply),
            x_after: U128(self.x),
            pot_after: U128(self.pot),
            ts_ms: env::block_timestamp_ms(),
            block: env::block_height(),
        });
        self.journal.len() as u64 - 1
    }

    fn trade_event(&self, seq: u64, account: &AccountId, tokens: u128, near: u128, fee: u128) -> TradeEvent {
        TradeEvent {
            seq,
            account: account.clone(),
            tokens: U128(tokens),
            near: U128(near),
            fee: U128(fee),
            supply: U128(self.token.total_supply),
            x: U128(self.x),
            pot: U128(self.pot),
            ts_ms: env::block_timestamp_ms(),
            block: env::block_height(),
        }
    }

    fn payout(account: AccountId, amount: u128, kind: &str) -> Promise {
        Promise::new(account.clone())
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(ON_PAYOUT_GAS)
                    .on_payout(account, U128(amount), kind.to_string()),
            )
    }

    /// Reserve, pot and storage stay covered after `outgoing` leaves. Panicking reverts the
    /// call; a plain NEAR transfer to the contract fixes a depleted bootstrap.
    fn assert_solvent(&mut self, outgoing: u128) {
        self.journal.flush();
        self.rugs.flush();
        let balance = env::account_balance().as_yoctonear();
        let storage = env::storage_usage() as u128 * env::storage_byte_cost().as_yoctonear();
        require!(
            balance >= outgoing + self.reserve + self.pot + storage,
            "E_INSOLVENT: bootstrap depleted"
        );
    }
}

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, _burned) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    /// Deliberate deviation from NEP-145: registration storage is never reclaimed. Unregistering
    /// during an `ft_transfer_call` would burn silently through the library's resolver.
    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        let _ = force;
        env::panic_str("E_UNREGISTER_DISABLED: unregistering is disabled")
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().unwrap_or_else(|| env::abort())
    }
}
