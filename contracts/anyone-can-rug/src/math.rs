//! Pure integer math for the curve, the threshold and the Gap solvers.
//! No `env`, no state: everything here is a function of its arguments.
#![allow(clippy::manual_div_ceil)]

use uint::construct_uint;

construct_uint! {
    /// 256-bit unsigned integer, used for every intermediate product.
    pub struct U256(4);
}

/// One whole token in base units (18 decimals).
pub const ONE: u128 = 1_000_000_000_000_000_000;
/// Hard cap on the curve position: one billion whole tokens.
pub const X_MAX: u128 = 1_000_000_000 * ONE;
pub const BPS: u128 = 10_000;

/// Linear curve `p = p0 + a * s`, with `s` in whole tokens and `p` in yocto per whole token.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Curve {
    pub p0: u128,
    pub a: u128,
}

fn u(v: u128) -> U256 {
    U256::from(v)
}

/// `ceil(a * b / c)`.
pub fn mul_div_ceil(a: u128, b: u128, c: u128) -> u128 {
    let (q, rem) = (u(a) * u(b)).div_mod(u(c));
    (if rem.is_zero() { q } else { q + U256::one() }).as_u128()
}

/// `floor(a * b / c)`.
pub fn mul_div_floor(a: u128, b: u128, c: u128) -> u128 {
    ((u(a) * u(b)) / u(c)).as_u128()
}

/// Reserve the curve holds at position `x`, rounded up.
/// Buy costs and sell gross are both differences of this one function, so costs are
/// path-independent and `reserve == r(x)` holds exactly.
pub fn r(c: Curve, x: u128) -> u128 {
    let x = u(x);
    let num = u(2) * u(c.p0) * u(ONE) * x + u(c.a) * x * x;
    let den = u(2) * u(ONE) * u(ONE);
    let (q, rem) = num.div_mod(den);
    (if rem.is_zero() { q } else { q + U256::one() }).as_u128()
}

/// Floor of the square root (Newton from a bit-length start).
pub fn isqrt(n: U256) -> U256 {
    if n.is_zero() {
        return n;
    }
    let mut x = U256::one() << ((n.bits() + 1) / 2);
    loop {
        let y = (x + n / x) >> 1;
        if y >= x {
            return x;
        }
        x = y;
    }
}

/// Curve position whose area is `reserve`, rounded down. `r(inv(R)) <= R` for every `R`.
pub fn inv(c: Curve, reserve: u128) -> u128 {
    let d = u(c.p0) * u(c.p0) + u(2) * u(c.a) * u(reserve);
    ((isqrt(d) - u(c.p0)) * u(ONE) / u(c.a)).as_u128()
}

/// Spot price at position `x`, in yocto per whole token.
pub fn price_at(c: Curve, x: u128) -> u128 {
    (u(c.p0) + u(c.a) * u(x) / u(ONE)).as_u128()
}

/// A fee is always rounded up.
pub fn fee_ceil(v: u128, fee_bps: u16) -> u128 {
    mul_div_ceil(v, fee_bps as u128, BPS)
}

pub fn hwm_floor(hwm: u128, hwm_floor_bps: u16) -> u128 {
    mul_div_floor(hwm, hwm_floor_bps as u128, BPS)
}

/// Tokens a rug must burn.
pub fn t_required(s: u128, hwm: u128, tau_bps: u16, hwm_floor_bps: u16) -> u128 {
    let base = s.max(hwm_floor(hwm, hwm_floor_bps));
    mul_div_ceil(tau_bps as u128, base, BPS)
}

/// Net NEAR from selling `v` tokens starting at curve position `x`, before the journal fee.
pub fn net_sell(c: Curve, x: u128, v: u128, fee_bps: u16) -> u128 {
    let gross = r(c, x) - r(c, x.saturating_sub(v));
    gross - fee_ceil(gross, fee_bps)
}

/// Fee on selling `v` tokens starting at curve position `x`.
pub fn sell_fee(c: Curve, x: u128, v: u128, fee_bps: u16) -> u128 {
    fee_ceil(r(c, x) - r(c, x.saturating_sub(v)), fee_bps)
}

fn div_ceil(num: u128, den: u128) -> u128 {
    if num == 0 {
        0
    } else {
        (num - 1) / den + 1
    }
}

/// Tokens to mint so that `bal + dx` still covers the threshold the purchase itself raises.
/// `inv` floors the square root, so a deposit that pays for `dx` can mint up to `ONE/a + 1`
/// base units less. The margin covers that.
pub fn gap_buy_dx(
    c: Curve,
    s: u128,
    hwm: u128,
    bal: u128,
    tau_bps: u16,
    hwm_floor_bps: u16,
) -> u128 {
    let tau = tau_bps as u128;
    let from_supply = div_ceil((tau * s).saturating_sub(bal * BPS), BPS - tau);
    let t_floor = mul_div_ceil(tau, hwm_floor(hwm, hwm_floor_bps), BPS);
    let from_floor = t_floor.saturating_sub(bal);
    from_supply.max(from_floor) + 1 + ONE / c.a + 2
}

/// Largest sale that still leaves the seller with at least the threshold.
/// Only meaningful when `w >= t_required(s, hwm, ..)`.
pub fn gap_exit_s(s: u128, hwm: u128, w: u128, tau_bps: u16, hwm_floor_bps: u16) -> u128 {
    let tau = tau_bps as u128;
    let from_supply = (w * BPS).saturating_sub(tau * s) / (BPS - tau);
    let t_floor = mul_div_ceil(tau, hwm_floor(hwm, hwm_floor_bps), BPS);
    from_supply.min(w.saturating_sub(t_floor))
}

/// `plus - minus` as a sign and a magnitude. Zero counts as positive.
pub fn signed(plus: u128, minus: u128) -> (bool, u128) {
    if plus >= minus {
        (true, plus - minus)
    } else {
        (false, minus - plus)
    }
}
