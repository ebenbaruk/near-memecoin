## Simulation: 60 days, before parameters were chosen
These results come from **modelled agents whose behaviour we assumed**. Nothing is fitted to real trading data.
They compare parameter choices. They are not a forecast and imply no return for anyone.

Reproduce: `npm run sim -- --quick` (seconds) or `npm run sim` (about 142 min). Seeds and code are in `sim/`.
Rules are integer-exact and replayed against the contract with 523 shared test vectors (25078 steps).

![Supply over time under six scenarios](docs-assets/sim/supply-over-time.png)

| Scenario | Games with no rug | Median rugs | Supply at day 60 vs control | Retail vs fee-burn control |
|---|---|---|---|---|
| organic | 0% | 3 | -10.0% [-11.4, -7.7] | +3.3 [+3.3, +3.3] |
| no-bot | 88% | 0 | -1.2% [-2.3, -0.0] | +0.0 [-0.0, +0.0] |
| whale | 0% | 2 | -18.3% [-19.2, -17.1] | -2.3 [-2.4, -2.2] |
| wash | 0% | 11 | -34.9% [-36.0, -33.6] | +6.9 [+6.9, +6.9] |
| sybil | 0% | 3 | -33.4% [-34.9, -32.6] | -1.7 [-1.8, -1.6] |
| panic-early | 0% | 3 | -9.2% [-10.9, -7.6] | +3.0 [+2.9, +3.0] |
| panic-after | 0% | 3 | -8.2% [-9.8, -7.3] | +2.9 [+2.9, +2.9] |
| hype | 0% | 5 | -19.7% [-21.7, -17.4] | +3.1 [+3.1, +3.2] |
| dead | 0% | 2 | -26.4% [-35.5, -15.3] | +3.2 [+3.2, +3.2] |
| tiny | 0% | 2 | -15.8% [-21.8, -8.0] | +2.6 [+2.5, +2.7] |
| all-in | 0% | 7 | -55.2% [-58.4, -52.5] | -4.2 [-4.5, -3.6] |

**Control coin:** same bonding curve and same agents, but no rug; fees are destroyed (A) or absent (B).
Retail column: paired median difference in percentage points of capital invested, with bootstrap CI.

**Parameters chosen:** tau 5%, fee 2%, curve p = 0.00001 + 1e-10·S NEAR, Pmin 0.05 NEAR, selected by the rule in `Docs/spec/30-simulation.md`.
The viable band is tau/f between 1.0 and 10.0, measured on a 20-seed screen of 505 (cell, Pmin) pairs; the 11 finalists were confirmed on 100 seeds and scored on 200 assumption draws:

![Viable band](docs-assets/sim/viable-band.png)

**What the model says that you should not like**
- Bots and whales will probably win. With a 25% holder in the game, that holder took 99% of rugs.
- Without an attentive bot, 88% of modelled games saw no rug.
- Assumptions that change the conclusion most: Whale target share (rank corr. with viability -0.29); Baseline sell rate per day (rank corr. with viability 0.24); Momentum sensitivity (rank corr. with viability -0.18).
- Single assumptions that alone push the selected point out of the viable band: Momentum sensitivity, Number of snipers, Whale target share.
- Timing depends on an assumed order flow; at demo scale, with order flow at 2% of the base case, 100% of modelled games saw at least one rug, median 2 rugs.
