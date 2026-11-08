import { parentPort } from "node:worker_threads";
import { runPaired } from "./engine.ts";
import type { Task } from "./pool.ts";
import type { RunSummary } from "./types.ts";

const port = parentPort;
if (!port) throw new Error("worker.ts must run in a worker thread");

function strip(r: RunSummary): RunSummary {
  return { ...r, supplyDaily: [r.supplyDaily[60]], burnedDaily: [], potDaily: [] };
}

port.on("message", ({ index, task }: { index: number; task: Task }) => {
  try {
    const out = runPaired(
      { scenario: task.scenario, seed: task.seed, params: task.params, assumptions: task.assumptions, whalePolicy: task.whalePolicy },
      task.variants,
    );
    port.postMessage({ index, results: task.lite ? out.map(strip) : out });
  } catch (e) {
    port.postMessage({ index, error: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) });
  }
});
