//! NEP-297 events of the `anyone_can_rug` standard. Field order is part of the format.

use near_sdk::json_types::U128;
use near_sdk::serde::Serialize;
use near_sdk::{env, serde_json, AccountId};

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct Envelope<'a, T: Serialize> {
    standard: &'a str,
    version: &'a str,
    event: &'a str,
    data: [T; 1],
}

fn emit<T: Serialize>(event: &str, data: T) {
    let body = Envelope {
        standard: "anyone_can_rug",
        version: "1.0.0",
        event,
        data: [data],
    };
    let json = serde_json::to_string(&body).unwrap_or_else(|_| env::abort());
    env::log_str(&format!("EVENT_JSON:{json}"));
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct TradeEvent {
    pub seq: u64,
    pub account: AccountId,
    pub tokens: U128,
    pub near: U128,
    pub fee: U128,
    pub supply: U128,
    pub x: U128,
    pub pot: U128,
    pub ts_ms: u64,
    pub block: u64,
}

impl TradeEvent {
    pub fn emit_buy(self) {
        emit("buy", self);
    }
    pub fn emit_sell(self) {
        emit("sell", self);
    }
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct RugEvent {
    pub seq: u64,
    pub round_id: u64,
    pub account: AccountId,
    pub burned: U128,
    pub payout: U128,
    pub pot_before: U128,
    pub supply: U128,
    pub x: U128,
    pub next_round_id: u64,
    pub ts_ms: u64,
    pub block: u64,
}

impl RugEvent {
    pub fn emit(self) {
        emit("rug", self);
    }
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct PayoutFailedEvent {
    pub seq: u64,
    pub account: AccountId,
    pub amount: U128,
    pub kind: String,
}

impl PayoutFailedEvent {
    pub fn emit(self) {
        emit("payout_failed", self);
    }
}
