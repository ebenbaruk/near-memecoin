use crate::math::*;

const LIVE: Curve = Curve { p0: 10_000_000_000_000_000_000, a: 10_000_000_000_000 };
const MAX: Curve = Curve { p0: 10_000_000_000_000_000_000_000_000, a: 100_000_000_000_000_000_000 };

#[test]
fn r_zero_is_zero() {
    assert_eq!(r(LIVE, 0), 0);
}

#[test]
fn r_is_monotone() {
    let mut prev = 0;
    for i in 0..2000u128 {
        let v = r(LIVE, i * ONE / 7 * i);
        assert!(v >= prev);
        prev = v;
    }
}

#[test]
fn r_matches_python_vectors() {
    // (p0, a, x, expected), computed independently with Python integers:
    // ceil((2*p0*10**18*x + a*x*x) / (2*10**36))
    let cases: [(u128, u128, u128, u128); 10] = [
        (10_000_000_000_000_000_000, 10_000_000_000_000, 1_000_000_000_000_000_000, 10_000_005_000_000_000_000),
        (10_000_000_000_000_000_000, 10_000_000_000_000, 1_000_000 * ONE, 15_000_000_000_000_000_000_000_000),
        (5_000_000_000_000_000_000, 50_000_000_000_000, 100_000 * ONE, 750_000_000_000_000_000_000_000),
        (1, 1, 1, 1),
        (1, 1, 2, 1),
        (1, 1, ONE, 2),
        (1, 1, 3 * ONE, 8),
        (7, 3, 12_345_678_901_234_567_890, 316),
        (10_000_000_000_000_000_000_000_000, 100_000_000_000_000_000_000, 1_000 * ONE, 10_050_000_000_000_000_000_000_000_000),
        (10_000_000_000_000_000_000, 10_000_000_000_000, 123_456_789_012_345_678_901, 1_234_644_098_017_222_983_194),
    ];
    for (p0, a, x, expected) in cases {
        assert_eq!(r(Curve { p0, a }, x), expected, "x={x}");
    }
}

#[test]
fn r_ceil_rounds_up() {
    // One base unit at p0 = 1 is 1e-18 yocto: the exact area is positive and below 1.
    assert_eq!(r(Curve { p0: 1, a: 1 }, 1), 1);
}

#[test]
fn inv_never_overshoots() {
    for reserve in (0..4000u128).map(|i| i * i * i * 1_000_000_000_000_000_000_000 + i) {
        for c in [LIVE, MAX, Curve { p0: 1, a: 1 }] {
            assert!(r(c, inv(c, reserve)) <= reserve, "R={reserve}");
        }
    }
}

#[test]
fn inv_floor_minimal_dust() {
    for i in 1..3000u128 {
        let reserve = i * i * 1_000_000_000_000_000_000_000;
        let x = inv(LIVE, reserve);
        let dust = reserve - r(LIVE, x);
        let bound = price_at(LIVE, x) * (ONE / LIVE.a + 2) / ONE + 1;
        assert!(dust <= bound, "dust {dust} above {bound} at R={reserve}");
        // The next base unit past the granularity would overshoot.
        assert!(r(LIVE, x + ONE / LIVE.a + 2) > reserve);
    }
}

#[test]
fn isqrt_exact_squares() {
    for v in [0u128, 1, 2, 3, 1000, 1 << 64, u128::MAX] {
        let n = U256::from(v) * U256::from(v);
        assert_eq!(isqrt(n), U256::from(v));
    }
}

#[test]
fn isqrt_floors() {
    for v in [2u128, 3, 1000, 1 << 64, u128::MAX - 1] {
        let square = U256::from(v) * U256::from(v);
        assert_eq!(isqrt(square - U256::one()), U256::from(v - 1));
        assert_eq!(isqrt(square + U256::one()), U256::from(v));
    }
}

#[test]
fn isqrt_u256_max_input() {
    assert_eq!(isqrt(U256::MAX), U256::from(u128::MAX));
}

#[test]
fn no_overflow_at_x_max_a_max() {
    let top = r(MAX, X_MAX);
    assert!(top > 0);
    let x = inv(MAX, top);
    assert!(x <= X_MAX);
    assert!(inv(MAX, u128::MAX) > 0);
    assert!(inv(Curve { p0: 1, a: 1 }, u128::MAX) > 0);
    assert!(price_at(MAX, X_MAX) > 0);
}

#[test]
fn fee_ceil_rounds_up() {
    assert_eq!(fee_ceil(1, 200), 1);
    assert_eq!(fee_ceil(101, 200), 3);
}

#[test]
fn fee_ceil_exact_multiple() {
    assert_eq!(fee_ceil(100, 200), 2);
    assert_eq!(fee_ceil(10_000, 1), 1);
}

#[test]
fn t_required_max_of_s_and_floor() {
    assert_eq!(t_required(1000, 1000, 500, 9000), 50);
    // Floor dominates: 0.9 * 10000 = 9000, 5 % = 450.
    assert_eq!(t_required(100, 10_000, 500, 9000), 450);
    assert_eq!(t_required(9001, 10_000, 500, 9000), 451);
}

#[test]
fn gap_buy_dx_when_s_dominates() {
    let c = LIVE;
    let s = 1_000 * ONE;
    let dx = gap_buy_dx(c, s, s, 0, 500, 9000);
    let t = t_required(s + dx, s + dx, 500, 9000);
    assert!(dx >= t);
    // Within the sqrt margin of the exact fixed point s*tau/(1-tau).
    let exact = (s * 500).div_ceil(9500);
    assert!(dx - exact <= ONE / c.a + 4);
}

#[test]
fn gap_buy_dx_when_hwm_dominates() {
    let hwm = 10_000 * ONE;
    let s = 100 * ONE;
    let dx = gap_buy_dx(LIVE, s, hwm, 0, 500, 9000);
    assert!(dx >= t_required(s + dx, hwm, 500, 9000));
    assert!(dx <= 450 * ONE + ONE / LIVE.a + 4);
}

#[test]
fn gap_exit_min_of_two_roots() {
    // Supply bound applies: holder of everything can sell all but the part T still needs.
    let s = 1_000 * ONE;
    let w = 500 * ONE;
    let sold = gap_exit_s(s, s, w, 500, 9000);
    assert!(w - sold >= t_required(s - sold, s, 500, 9000));
    assert!(w - sold - 1 < t_required(s - sold - 1, s, 500, 9000) || sold + 1 > w);
    // HWM floor applies once it is above the post-sale supply.
    let hwm = 100_000 * ONE;
    let w = 10_000 * ONE;
    let s = 20_000 * ONE;
    let sold = gap_exit_s(s, hwm, w, 500, 9000);
    assert_eq!(w - sold, t_required(0, hwm, 500, 9000));
}

#[test]
fn signed_handles_both_directions() {
    assert_eq!(signed(5, 3), (true, 2));
    assert_eq!(signed(3, 5), (false, 2));
    assert_eq!(signed(3, 3), (true, 0));
}
