// Scenarios of spec §4: agent roster and retail order flow.

export interface Scenario {
  id: string;
  /** Retail buys per day at flow multiplier 1. */
  arrivals: (day: number) => number;
  /** Multiplier applied on top of Assumptions.flow. */
  flowExtra: number;
  s0?: number;
  snipers: boolean;
  whale: boolean;
  wash: boolean;
  sybil: boolean;
  shock: "early" | "after" | null;
}

const base = (j: number): number => 100 * Math.exp(-j / 20) + 10;
const hype = (j: number): number => 300 * Math.exp(-j / 5) + 30;
const dead = (j: number): number => (j < 3 ? base(j) : 0.02 * base(j));

const organic: Scenario = {
  id: "organic", arrivals: base, flowExtra: 1, snipers: true, whale: false, wash: false, sybil: false, shock: null,
};

export const SCENARIOS: Scenario[] = [
  organic,
  { ...organic, id: "no-bot", snipers: false },
  { ...organic, id: "whale", whale: true },
  { ...organic, id: "wash", wash: true },
  { ...organic, id: "sybil", sybil: true },
  { ...organic, id: "panic-early", shock: "early" },
  { ...organic, id: "panic-after", shock: "after" },
  { ...organic, id: "hype", arrivals: hype, s0: 0.2 },
  { ...organic, id: "dead", arrivals: dead },
  { ...organic, id: "tiny", flowExtra: 0.02 },
  { ...organic, id: "all-in", whale: true, wash: true, sybil: true },
];

export function scenarioById(id: string): Scenario {
  const s = SCENARIOS.find((c) => c.id === id);
  if (!s) throw new Error(`unknown scenario ${id}`);
  return s;
}
