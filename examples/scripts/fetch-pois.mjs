/**
 * fetch-pois.mjs — 数据回路示范：从高德 Web 服务 API 检索公开 POI，产出标准 GeoJSON。
 *
 * 用法：
 *   AMAP_KEY=xxx node examples/scripts/fetch-pois.mjs      # 也可自动读 ~/.openclaw/.env.amap
 *
 * 合规说明（docs/provider.md §5）：
 *   - key 只在本地脚本内使用，产物 GeoJSON 不含 key、不含个人信息（公开 POI）。
 *   - 检索结果坐标 = GCJ-02，与高德底图一致。
 *   - 可重复运行刷新数据；CI 不跑本脚本。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'data');
mkdirSync(OUT_DIR, { recursive: true });

function readKey() {
  if (process.env.AMAP_KEY) return process.env.AMAP_KEY;
  try {
    const line = readFileSync(join(homedir(), '.openclaw/.env.amap'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('AMAP_KEY='));
    if (line) return line.split('=')[1].trim().replace(/["']/g, '');
  } catch {}
  throw new Error('缺少 AMAP_KEY：请设置环境变量或 ~/.openclaw/.env.amap');
}

const KEY = readKey();

async function textSearch(keywords, city) {
  const url = new URL('https://restapi.amap.com/v3/place/text');
  url.searchParams.set('keywords', keywords);
  url.searchParams.set('city', city);
  url.searchParams.set('key', KEY);
  url.searchParams.set('offset', '5');
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const d = await res.json();
  if (d.status !== '1' || !Array.isArray(d.pois) || d.pois.length === 0) {
    console.warn(`  检索失败: ${keywords}@${city} -> ${d.info ?? d.infocode}`);
    return null;
  }
  // 取第一个精确度最高的结果（keywords 已足够具体）
  const p = d.pois[0];
  const [lon, lat] = p.location.split(',').map(Number);
  return { name: p.name, lon, lat, address: p.address ?? '' };
}

/** 每处检索定义：输出文件名 + 目标数据（keywords 用最具体写法避免重名） */
const TARGETS = {
  'pois-qcs': [
    { kw: '都江堰青城山老君阁', city: '都江堰市' },
    { kw: '青城山天师洞', city: '都江堰市' },
    { kw: '青城山月城湖', city: '都江堰市' },
    { kw: '青城山天然图画', city: '都江堰市' },
    { kw: '青城山索道', city: '都江堰市' },
    { kw: '青城山建福宫', city: '都江堰市' },
    { kw: '青城山朝阳洞', city: '都江堰市' },
  ],
  'pois-pan': [
    { kw: '成都大熊猫繁育研究基地熊猫塔', city: '成都市' },
    { kw: '成都大熊猫繁育研究基地月亮产房', city: '成都市' },
    { kw: '成都大熊猫繁育研究基地太阳产房', city: '成都市' },
    { kw: '成都大熊猫繁育研究基地大门', city: '成都市' },
    { kw: '成都大熊猫繁育研究基地天鹅湖', city: '成都市' },
    { kw: '成都大熊猫繁育研究基地幼年大熊猫别墅', city: '成都市' },
  ],
  'pois-sxd': [
    { kw: '三星堆博物馆综合馆', city: '广汉市' },
    { kw: '三星堆博物馆青铜馆', city: '广汉市' },
    { kw: '三星堆文物修复馆', city: '广汉市' },
    { kw: '三星堆博物馆游客中心', city: '广汉市' },
  ],
};

function toGeoJson(results) {
  const features = results
    .filter(Boolean)
    .map((r, i) => ({
      type: 'Feature',
      id: `poi-${i + 1}`,
      properties: { sym: 'poi', name: r.name, address: r.address, source: 'amap-place-text' },
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
    }));
  return {
    type: 'FeatureCollection',
    properties: { anymap: { crs: 'GCJ-02', schemaVer: '0.1.0', source: '高德 Web 服务 place/text（公开 POI）' } },
    features,
  };
}

for (const [file, queries] of Object.entries(TARGETS)) {
  console.log(`== ${file} ==`);
  const results = [];
  for (const q of queries) {
    // QPS 低，串行 + 小延时
    const r = await textSearch(q.kw, q.city);
    if (r) console.log(`  ✓ ${r.name}  ${r.lon},${r.lat}`);
    else console.log(`  ✗ ${q.kw}`);
    results.push(r);
    await new Promise((res) => setTimeout(res, 350));
  }
  const geojson = toGeoJson(results);
  writeFileSync(join(OUT_DIR, `${file}.geojson`), JSON.stringify(geojson, null, 2));
  console.log(`  → ${file}.geojson (${geojson.features.length} features)`);
}
console.log('done');
