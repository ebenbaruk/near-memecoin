// Worker-thread pool. Runs are independent; results come back indexed, so order never depends on scheduling.
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import type { Params } from "./rules.ts";
import type { Assumptions, RunSummary, Variant, WhalePolicy } from "./types.ts";

export interface Task {
  scenario: string;
  seed: number;
  params: Params;
  assumptions: Assumptions;
  whalePolicy?: WhalePolicy;
  variants: Variant[];
  /** Drops the daily series from the reply. */
  lite: boolean;
}

interface Reply {
  index: number;
  results?: RunSummary[];
  error?: string;
}

const pool: Worker[] = [];
let onMessage: (w: Worker, m: Reply) => void = () => {};
let onError: (e: Error) => void = () => {};

function ensurePool(): Worker[] {
  if (pool.length === 0) {
    const size = Math.max(1, availableParallelism());
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL("./worker.ts", import.meta.url));
      w.on("error", (e) => onError(e as Error));
      w.on("message", (m: Reply) => onMessage(w, m));
      pool.push(w);
    }
  }
  return pool;
}

export async function runTasks(tasks: Task[], label = ""): Promise<RunSummary[][]> {
  const results = new Array<RunSummary[]>(tasks.length);
  if (tasks.length === 0) return results;
  const workers = ensurePool();
  const started = Date.now();
  let next = 0;
  let done = 0;
  let lastLog = Date.now();
  await new Promise<void>((resolve, reject) => {
    const feed = (w: Worker): void => {
      if (next < tasks.length) {
        const index = next++;
        w.postMessage({ index, task: tasks[index] });
      }
    };
    onError = reject;
    onMessage = (w, m) => {
      if (m.error) return reject(new Error(m.error));
      results[m.index] = m.results as RunSummary[];
      done++;
      if (label && Date.now() - lastLog > 30_000) {
        lastLog = Date.now();
        process.stderr.write(`  [${label}] ${done}/${tasks.length} (${((Date.now() - started) / 1000).toFixed(0)}s)\n`);
      }
      if (done === tasks.length) resolve();
      else feed(w);
    };
    for (const w of workers) feed(w);
  });
  return results;
}
