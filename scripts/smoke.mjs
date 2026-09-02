/**
 * smoke.mjs — 渲染产物冒烟检查（verification.md L3）：dist/demo 存在且带指纹标记。
 * 用法：npm run build && npm run demo && npm run smoke
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = join(root, 'dist/demo');
const required = ['index.html', 'qcs.html', 'pan.html', 'sxd.html'];
let fail = 0;

for (const f of required) {
  const fp = join(demoDir, f);
  if (!existsSync(fp)) {
    console.error(`✗ 缺少 ${f}`);
    fail++;
    continue;
  }
  const s = readFileSync(fp, 'utf8');
  const ok = s.includes('maplibre-gl') && s.includes('anymap-data') && s.includes('webrd0');
  if (!ok) {
    console.error(`✗ ${f} 缺少 maplibre/anymap-data/高德瓦片标记`);
    fail++;
  } else {
    console.log(`✓ ${f} (${(s.length / 1024).toFixed(0)} KB)`);
  }
}
if (fail > 0) {
  console.error(`smoke 失败：${fail} 项`);
  process.exit(1);
}
console.log('smoke 通过');
