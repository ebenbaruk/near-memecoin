//! Runs the committed wasm in a local NEAR sandbox: real promises, callbacks, refunds and batches.
//! The wasm must be current: `cargo near build non-reproducible-wasm` in
//! contracts/anyone-can-rug, then copy target/near/anyone_can_rug/anyone_can_rug.wasm to res/.

use near_workspaces::network::Sandbox;
use near_workspaces::operations::Function;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

const WASM: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../contracts/anyone-can-rug/res/anyone_can_rug.wasm");
const VECTORS: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../fixtures/vectors.json");
const GAS: Gas = Gas::from_tgas(100);
const NEAR: u128 = 1_000_000_000_000_000_000_000_000;

fn yocto(v: u128) -> NearToken {
    NearToken::from_yoctonear(v)
}

fn params() -> Value {
    json!({
        "name":"Anyone Can Rug","symbol":"RUGPRICE","p0":"10000000000000000000","a":"10000000000000",
        "fee_bps":200,"tau_bps":500,"hwm_floor_bps":9000,"pot_min":"10000000000000000000000",
        "min_buy":"50000000000000000000000","journal_fee":"3000000000000000000000","rug_fee":"6000000000000000000000"
    })
}

async fn deploy_with(worker: &Worker<Sandbox>, params: Value) -> anyhow::Result<Contract> {
    let wasm = std::fs::read(WASM)?;
    let contract = worker.dev_deploy(&wasm).await?;
    let res = contract.call("new").args_json(json!({ "params": params })).transact().await?;
    assert!(res.is_success(), "{res:?}");
    Ok(contract)
}

async fn setup() -> anyhow::Result<(Worker<Sandbox>, Contract)> {
    let worker = near_workspaces::sandbox().await?;
    let contract = deploy_with(&worker, params()).await?;
    Ok((worker, contract))
}

async fn buy(c: &Contract, who: &Account, deposit: u128) -> anyhow::Result<ExecutionFinalResult> {
    Ok(who.call(c.id(), "buy").args_json(json!({"min_out":"0"})).deposit(yocto(deposit)).gas(GAS).transact().await?)
}

async fn state(c: &Contract) -> anyhow::Result<Value> {
    Ok(c.view("get_state").await?.json()?)
}

async fn balance(c: &Contract, who: &Account) -> anyhow::Result<u128> {
    let v: String = c.view("ft_balance_of").args_json(json!({"account_id": who.id()})).await?.json()?;
    Ok(v.parse()?)
}

fn u(v: &Value) -> u128 {
    v.as_str().unwrap().parse().unwrap()
}

fn errors(res: &ExecutionFinalResult) -> String {
    format!("{:?}", res.failures())
}

#[tokio::test]
async fn sandbox_smoke() -> anyhow::Result<()> {
    let (worker, c) = setup().await?;
    let alice = worker.dev_create_account().await?;
    assert!(buy(&c, &alice, 2 * NEAR).await?.is_success());
    let s = state(&c).await?;
    assert_eq!(s["journal_len"], 1);
    assert!(s["surplus"]["positive"].as_bool().unwrap());
    Ok(())
}

#[tokio::test]
async fn sandbox_buy_sell_rug_full_flow() -> anyhow::Result<()> {
    let (worker, c) = setup().await?;
    let alice = worker.dev_create_account().await?;
    assert!(buy(&c, &alice, 5 * NEAR).await?.is_success());
    let bal = balance(&c, &alice).await?;

    let before = alice.view_account().await?.balance;
    let sold = alice.call(c.id(), "sell").args_json(json!({"amount": (bal / 10).to_string(), "min_out":"0"}))
        .deposit(yocto(1)).gas(GAS).transact().await?;
    assert!(sold.is_success(), "{sold:?}");
    assert!(alice.view_account().await?.balance > before);

    let s = state(&c).await?;
    let t = u(&s["t_required"]);
    let pot = u(&s["pot"]);
    let before = alice.view_account().await?.balance;
    let rug = alice.call(c.id(), "rug").args_json(json!({"round_id": s["round_id"], "min_payout":"0", "max_burn": t.to_string()}))
        .deposit(yocto(1)).gas(GAS).transact().await?;
    assert!(rug.is_success(), "{rug:?}");
    let gained = alice.view_account().await?.balance.as_yoctonear() as i128 - before.as_yoctonear() as i128;
    let expected = (pot - 6_000_000_000_000_000_000_000) as i128;
    assert!((expected - gained).abs() < NEAR as i128 / 100, "gained {gained}, expected about {expected}");

    let s2 = state(&c).await?;
    assert_eq!(s2["round_id"], 2);
    assert_eq!(s2["pot"], "0");
    assert_eq!(s2["x"], s["x"]);
    assert_eq!(s2["reserve"], s["reserve"]);
    assert_eq!(balance(&c, &alice).await?, bal - bal / 10 - t);
    assert!(s2["surplus"]["positive"].as_bool().unwrap());

    let journal: Vec<Value> = c.view("get_journal").args_json(json!({"from_index":0,"limit":100})).await?.json()?;
    let kinds: Vec<&str> = journal.iter().map(|e| e["kind"].as_str().unwrap()).collect();
    assert_eq!(kinds, ["buy", "sell", "rug"]);
    Ok(())
}

#[tokio::test]
async fn sandbox_batch_buy_then_rug_atomic() -> anyhow::Result<()> {
    let (worker, c) = setup().await?;
    let alice = worker.dev_create_account().await?;
    let carol = worker.dev_create_account().await?;
    assert!(buy(&c, &alice, 5 * NEAR).await?.is_success());
    let gap: Value = c.view("get_gap_buy").args_json(json!({"account_id": carol.id()})).await?.json()?;
    assert_eq!(gap["feasible"], true);
    let s = state(&c).await?;
    let res = carol.batch(c.id())
        .call(Function::new("buy").args_json(json!({"min_out": gap["min_out"]})).deposit(yocto(u(&gap["deposit_needed"]))).gas(GAS))
        .call(Function::new("rug").args_json(json!({"round_id": s["round_id"], "min_payout":"0", "max_burn": gap["t_required"]})).deposit(yocto(1)).gas(GAS))
        .transact().await?;
    assert!(res.is_success(), "{res:?}");
    assert_eq!(state(&c).await?["round_id"], 2);
    let rugs: Vec<Value> = c.view("get_rugs").args_json(json!({"from_index":0,"limit":50})).await?.json()?;
    assert_eq!(rugs[0]["rugger"], carol.id().to_string());
    Ok(())
}

#[tokio::test]
async fn sandbox_batch_reverts_rug_failure_keeps_no_tokens() -> anyhow::Result<()> {
    let (worker, c) = setup().await?;
    let alice = worker.dev_create_account().await?;
    let carol = worker.dev_create_account().await?;
    assert!(buy(&c, &alice, 5 * NEAR).await?.is_success());
    let gap: Value = c.view("get_gap_buy").args_json(json!({"account_id": carol.id()})).await?.json()?;
    let before_state = state(&c).await?;
    let before = carol.view_account().await?.balance;
    let res = carol.batch(c.id())
        .call(Function::new("buy").args_json(json!({"min_out": gap["min_out"]})).deposit(yocto(u(&gap["deposit_needed"]))).gas(GAS))
        .call(Function::new("rug").args_json(json!({"round_id": 99, "min_payout":"0", "max_burn": gap["t_required"]})).deposit(yocto(1)).gas(GAS))
        .transact().await?;
    assert!(!res.is_success());
    assert!(errors(&res).contains("E_ROUND_STALE"), "{}", errors(&res));
    assert_eq!(balance(&c, &carol).await?, 0);
    let after_state = state(&c).await?;
    for key in ["x", "supply", "pot", "reserve", "hwm", "journal_len"] {
        assert_eq!(after_state[key], before_state[key], "{key}");
    }
    let lost = before.as_yoctonear() - carol.view_account().await?.balance.as_yoctonear();
    assert!(lost < NEAR / 100, "lost {lost}");
    Ok(())
}

#[tokio::test]
async fn sandbox_failed_payout_goes_to_pot() -> anyhow::Result<()> {
    let (worker, c) = setup().await?;
    let root = worker.root_account()?;
    let victim = worker.dev_create_account().await?;
    assert!(buy(&c, &victim, 5 * NEAR).await?.is_success());
    let s = state(&c).await?;
    let pot = u(&s["pot"]);
    let rug_fee = 6_000_000_000_000_000_000_000u128;
    let journal_fee = 3_000_000_000_000_000_000_000u128;
    let tokens_before = balance(&c, &victim).await?;

    // The rug and the self-deletion race: the payout lands after the account is gone.
    let pending = victim.call(c.id(), "rug").args_json(json!({"round_id": 1, "min_payout":"0", "max_burn": s["t_required"]}))
        .deposit(yocto(1)).gas(GAS).transact_async().await?;
    victim.clone().delete_account(root.id()).await?.into_result()?;
    let outcome = loop {
        match pending.status().await? {
            std::task::Poll::Ready(v) => break v,
            std::task::Poll::Pending => tokio::time::sleep(std::time::Duration::from_millis(200)).await,
        }
    };
    let _ = outcome;
    let after = state(&c).await?;
    assert_eq!(after["round_id"], 2);
    let journal: Vec<Value> = c.view("get_journal").args_json(json!({"from_index":0,"limit":100})).await?.json()?;
    let last = journal.last().unwrap();
    assert_eq!(last["kind"], "payout_failed", "{journal:?}");
    let payout = pot - rug_fee;
    assert_eq!(u(&last["near"]), payout - journal_fee);
    assert_eq!(u(&after["pot"]), payout - journal_fee);
    // Tokens already burned stay burned.
    assert_eq!(u(&after["burned"]), u(&s["t_required"]));
    let _ = tokens_before;
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    assert!(state(&c).await?["surplus"]["positive"].as_bool().unwrap());
    Ok(())
}

#[tokio::test]
async fn sandbox_private_methods_reject_outsiders() -> anyhow::Result<()> {
    let (worker, c) = setup().await?;
    let alice = worker.dev_create_account().await?;
    assert!(buy(&c, &alice, NEAR).await?.is_success());
    let res = alice.call(c.id(), "on_payout").args_json(json!({"account_id": alice.id(), "amount":"1", "kind":"rug"})).transact().await?;
    assert!(errors(&res).contains("private"), "{}", errors(&res));
    let res = alice.call(c.id(), "ft_resolve_transfer").args_json(json!({"sender_id": alice.id(), "receiver_id": c.id(), "amount":"1"})).transact().await?;
    assert!(errors(&res).contains("private"), "{}", errors(&res));
    let res = alice.call(c.id(), "storage_unregister").args_json(json!({"force": true})).deposit(yocto(1)).transact().await?;
    assert!(errors(&res).contains("E_UNREGISTER_DISABLED"), "{}", errors(&res));
    Ok(())
}

#[tokio::test]
async fn sandbox_events_exact_json() -> anyhow::Result<()> {
    let (worker, c) = setup().await?;
    let alice = worker.dev_create_account().await?;
    let res = buy(&c, &alice, 5 * NEAR).await?;
    let logs = res.logs();
    let id = alice.id();
    assert!(logs[0].starts_with(&format!(r#"EVENT_JSON:{{"standard":"nep141","version":"1.0.0","event":"ft_mint","data":[{{"owner_id":"{id}","amount":""#)), "{}", logs[0]);
    assert!(logs[0].ends_with(r#","memo":"buy"}]}"#), "{}", logs[0]);
    assert!(logs[1].starts_with(&format!(r#"EVENT_JSON:{{"standard":"anyone_can_rug","version":"1.0.0","event":"buy","data":[{{"seq":0,"account":"{id}","tokens":""#)), "{}", logs[1]);
    let s = state(&c).await?;
    let rug = alice.call(c.id(), "rug").args_json(json!({"round_id":1,"min_payout":"0","max_burn":s["t_required"]})).deposit(yocto(1)).gas(GAS).transact().await?;
    let logs = rug.logs();
    assert!(logs.iter().any(|l| l.contains(r#""event":"ft_burn""#) && l.ends_with(r#","memo":"rug"}]}"#)), "{logs:?}");
    assert!(logs.iter().any(|l| l.contains(r#""event":"rug","data":[{"seq":1,"round_id":1,"#) && l.contains(r#""next_round_id":2,"#)), "{logs:?}");
    Ok(())
}

#[tokio::test]
async fn sandbox_gas_buy_sell_rug_under_50_tgas() -> anyhow::Result<()> {
    let (worker, c) = setup().await?;
    let alice = worker.dev_create_account().await?;
    let b = buy(&c, &alice, 5 * NEAR).await?;
    let bal = balance(&c, &alice).await?;
    let sell = alice.call(c.id(), "sell").args_json(json!({"amount": (bal/10).to_string(), "min_out":"0"})).deposit(yocto(1)).gas(GAS).transact().await?;
    let s = state(&c).await?;
    let rug = alice.call(c.id(), "rug").args_json(json!({"round_id":1,"min_payout":"0","max_burn":s["t_required"]})).deposit(yocto(1)).gas(GAS).transact().await?;
    println!("gas burnt: buy {} sell {} rug {}", b.total_gas_burnt, sell.total_gas_burnt, rug.total_gas_burnt);
    for r in [&b, &sell, &rug] {
        assert!(r.is_success());
        assert!(r.total_gas_burnt.as_tgas() < 50);
    }
    Ok(())
}

/// Replays 20 of the shared vectors on the real wasm, one contract each, concurrently. Curve, pot,
/// threshold, round and every error are compared; registration deposits and gas are not.
#[tokio::test]
async fn sandbox_vectors_replay_20() -> anyhow::Result<()> {
    let doc: Value = serde_json::from_str(&std::fs::read_to_string(VECTORS)?)?;
    // Actors are funded with 20 000 NEAR from the sandbox root.
    let fits = |seq: &Value| -> bool {
        let mut spent: std::collections::HashMap<&str, u128> = Default::default();
        for st in seq["steps"].as_array().unwrap() {
            if let Some(d) = st["args"]["deposit"].as_str() {
                *spent.entry(st["actor"].as_str().unwrap()).or_default() += d.parse::<u128>().unwrap();
            }
        }
        spent.values().all(|v| *v < 15_000 * NEAR)
    };
    let mut chosen: Vec<Value> = doc["sequences"].as_array().unwrap().iter().filter(|s| fits(s)).cloned().collect();
    // The short named edge cases, then full-length fuzz runs.
    chosen.sort_by_key(|s| s["steps"].as_array().unwrap().len());
    let fuzz = chosen.split_off(chosen.len() - 8);
    chosen.truncate(12);
    chosen.extend(fuzz);
    assert_eq!(chosen.len(), 20, "not enough sequences fit the funding");

    let worker = near_workspaces::sandbox().await?;
    let mut tasks = tokio::task::JoinSet::new();
    // Accounts come from one root signer, so setup is serial; the replays themselves run at once.
    for seq in chosen {
        let (c, actors) = prepare(&worker, &seq).await?;
        tasks.spawn(async move { replay_one(seq, c, actors).await });
    }
    let mut compared = 0;
    while let Some(done) = tasks.join_next().await {
        compared += done??;
    }
    println!("compared {compared} steps on the wasm");
    Ok(())
}

type Actors = std::collections::HashMap<String, Account>;

async fn prepare(worker: &Worker<Sandbox>, seq: &Value) -> anyhow::Result<(Contract, Actors)> {
    let id = seq["id"].as_str().unwrap();
    let mut p = seq["params"].clone();
    p.as_object_mut().unwrap().remove("reg_min");
    p["name"] = json!("Vectors");
    p["symbol"] = json!("VEC");
    let c = deploy_with(worker, p).await?;
    let mut actors = Actors::default();
    for step in seq["steps"].as_array().unwrap() {
        for name in [step["actor"].as_str(), step["args"]["to"].as_str()].into_iter().flatten() {
            if !actors.contains_key(name) {
                let sub = format!("{}{}", id.replace('-', ""), name).to_lowercase();
                let account = worker.root_account()?.create_subaccount(&sub).initial_balance(NearToken::from_near(20_000)).transact().await?.into_result()?;
                actors.insert(name.to_string(), account);
            }
        }
    }
    Ok((c, actors))
}

async fn replay_one(seq: Value, c: Contract, actors: Actors) -> anyhow::Result<usize> {
    let id = seq["id"].as_str().unwrap().to_string();
    let mut compared = 0;
    for step in seq["steps"].as_array().unwrap() {
        let actor = step["actor"].as_str().unwrap().to_string();
        let who = actors[&actor].clone();
        let a = &step["args"];
        let res = match step["op"].as_str().unwrap() {
            "buy" => who.call(c.id(), "buy").args_json(json!({"min_out":a["min_out"]})).deposit(yocto(u(&a["deposit"]))).gas(GAS).transact().await?,
            "sell" => who.call(c.id(), "sell").args_json(json!({"amount":a["amount"],"min_out":a["min_out"]})).deposit(yocto(1)).gas(GAS).transact().await?,
            "rug" => who.call(c.id(), "rug").args_json(json!({"round_id":u(&a["round"]) as u64,"min_payout":a["min_payout"],"max_burn":a["max_burn"]})).deposit(yocto(1)).gas(GAS).transact().await?,
            "transfer" => {
                let to = actors[a["to"].as_str().unwrap()].clone();
                who.call(c.id(), "ft_transfer").args_json(json!({"receiver_id":to.id(),"amount":a["amount"]})).deposit(yocto(1)).gas(GAS).transact().await?
            }
            "buy_rug" => who.batch(c.id())
                .call(Function::new("buy").args_json(json!({"min_out":a["min_out"]})).deposit(yocto(u(&a["deposit"]))).gas(GAS))
                .call(Function::new("rug").args_json(json!({"round_id":u(&a["round"]) as u64,"min_payout":a["min_payout"],"max_burn":a["max_burn"]})).deposit(yocto(1)).gas(GAS))
                .transact().await?,
            other => panic!("unknown op {other}"),
        };
        let expect = &step["expect"];
        if expect["ok"].as_bool().unwrap() {
            assert!(res.is_success(), "{id} step {compared}: {}", errors(&res));
        } else {
            assert!(errors(&res).contains(expect["error"].as_str().unwrap()), "{id} step {compared}: {}", errors(&res));
        }
        let s = state(&c).await?;
        let want = &expect["state"];
        for (a_key, b_key) in [("x","x"),("S","supply"),("B","burned"),("R","reserve"),("pot","pot"),("hwm","hwm"),("T","t_required")] {
            assert_eq!(want[a_key], s[b_key], "{id} step {compared} {a_key}");
        }
        assert_eq!(u(&want["round"]) as u64, s["round_id"].as_u64().unwrap(), "{id}");
        compared += 1;
    }
    Ok(compared)
}
