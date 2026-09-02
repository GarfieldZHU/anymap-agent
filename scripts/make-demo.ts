/**
 * make-demo.ts — 渲染 examples 到 dist/demo/（验收活标本，GOALS G6）。
 * 用法：npm run demo（tsx）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMapPage, getProvider } from '../packages/render/src/index.js';
import type { AnymapFeatureCollection } from '../packages/core/src/geo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'examples/data');
const outDir = join(root, 'dist/demo');
mkdirSync(outDir, { recursive: true });

const PAGES = [
  { key: 'qcs', title: '青城山前山徒步路线 · 成都行攻略 Demo', tag: '青城山前山' },
  { key: 'pan', title: '成都大熊猫繁育研究基地游览 · Demo', tag: '熊猫基地' },
  { key: 'sxd', title: '三星堆博物馆游览 · Demo', tag: '三星堆' },
];

function merge(routeFile: string, poiFile: string): AnymapFeatureCollection {
  const routes = JSON.parse(readFileSync(join(dataDir, routeFile), 'utf8')) as AnymapFeatureCollection;
  const pois = JSON.parse(readFileSync(join(dataDir, poiFile), 'utf8')) as AnymapFeatureCollection;
  return {
    type: 'FeatureCollection',
    properties: {
      anymap: { crs: 'GCJ-02', schemaVer: '0.1.0' },
      name: routeFile.replace('.routes.geojson', ''),
    },
    features: [...routes.features, ...pois.features],
  };
}

const provider = getProvider('amap');
const pages: Array<{ href: string; title: string; tag: string }> = [];

for (const p of PAGES) {
  const fc = merge(`${p.key}.routes.geojson`, `pois-${p.key}.geojson`);
  const html = buildMapPage(fc, provider, { title: p.title });
  const out = join(outDir, `${p.key}.html`);
  writeFileSync(out, html, 'utf8');
  const nRoutes = fc.features.filter((f) => f.properties?.sym === 'route').length;
  const nPois = fc.features.filter((f) => f.properties?.sym === 'poi').length;
  console.log(`✓ ${out}  (${nRoutes} routes / ${nPois} pois, ${(html.length / 1024).toFixed(0)} KB)`);
  pages.push({ href: `${p.key}.html`, title: p.title, tag: p.tag });
}

const index = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>anymap-agent · demo 索引</title>
<style>
  body { font-family: -apple-system, 'PingFang SC', sans-serif; background: #f7fafc; margin: 0; padding: 40px 20px; color: #1a202c; }
  h1 { font-size: 22px; }
  p.sub { color: #718096; font-size: 14px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; margin-top: 24px; max-width: 960px; }
  .card { background: #fff; border-radius: 10px; padding: 18px; box-shadow: 0 1px 4px rgba(0,0,0,.08); text-decoration: none; color: inherit; display: block; border: 1px solid #e2e8f0; }
  .card:hover { border-color: #3182ce; box-shadow: 0 4px 12px rgba(49,130,206,.15); }
  .card .tag { font-size: 12px; color: #3182ce; }
  .card .t { font-size: 16px; font-weight: 600; margin-top: 6px; }
  .note { margin-top: 28px; font-size: 12px; color: #a0aec0; max-width: 860px; line-height: 1.7; }
</style>
</head>
<body>
<h1>anymap-agent · 渲染 Demo</h1>
<p class="sub">MapLibre GL JS + 高德底图（免 key 瓦片） + GeoJSON 矢量层 · 数据 crs=GCJ-02 · 点击要素查看坐标</p>
<div class="cards">
${pages.map((p) => `<a class="card" href="${p.href}"><div class="tag">${p.tag}</div><div class="t">${p.title}</div></a>`).join('\n')}
</div>
<div class="note">
  本页为 CI/本地构建产物（dist/demo），源数据与生成脚本见 <code>examples/</code> 与 <code>scripts/make-demo.ts</code>。
  底图瓦片来自高德公开栅格端点（与 amap.com 同源），矢量数据为公开 POI + 行程轨迹。
</div>
</body>
</html>
`;
writeFileSync(join(outDir, 'index.html'), index, 'utf8');
console.log(`✓ ${join(outDir, 'index.html')} (demo index)`);
console.log('done');
