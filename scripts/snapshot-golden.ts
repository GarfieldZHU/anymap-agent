/**
 * snapshot-golden.ts — 回填 golden fixtures 的 worldXY anchors。
 * 用法：npm run prepare:golden（改动投影公式后需重跑并 review diff）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lonLatToWorldXY } from '../packages/core/src/projection.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fp = join(root, 'tests/golden/fixtures.json');
const fc = JSON.parse(readFileSync(fp, 'utf8'));

let changed = 0;
for (const lm of fc.landmarks) {
  const { x, y } = lonLatToWorldXY(lm.lon, lm.lat, lm.zoom);
  const anchor = { x: Number(x.toFixed(6)), y: Number(y.toFixed(6)) };
  const prev = lm.worldXY;
  if (!prev || prev.x !== anchor.x || prev.y !== anchor.y) {
    lm.worldXY = anchor;
    changed++;
  }
}
writeFileSync(fp, JSON.stringify(fc, null, 2) + '\n');
console.log(`golden anchors updated: ${changed} changed / ${fc.landmarks.length} total`);
