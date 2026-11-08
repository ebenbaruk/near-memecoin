import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const WASM = fileURLToPath(new URL('../contracts/anyone-can-rug/res/anyone_can_rug.wasm', import.meta.url));

function base58(bytes: Uint8Array): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = alphabet[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

function listFiles(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name), `${prefix}${e.name}/`)
      : statSync(join(dir, e.name)).size > 0 ? [`${prefix}${e.name}`] : [],
  );
}

const ART_FILES = listFiles(fileURLToPath(new URL('./public/art/', import.meta.url)));

const wasmHash = existsSync(WASM) ? base58(createHash('sha256').update(readFileSync(WASM)).digest()) : '';

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __WASM_HASH__: JSON.stringify(wasmHash), __ART_FILES__: JSON.stringify(ART_FILES) },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
