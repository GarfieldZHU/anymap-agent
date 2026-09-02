/**
 * @anymap/cli — anymap 命令行（GOALS G4.1）。
 *
 *   anymap validate <file.geojson | 'inline json'>    # schema + sym + crs 校验
 *   anymap render   <同上> --provider amap [-o out.html] [--title ..] [--center lon,lat] [--zoom n]
 *   anymap providers                                   # 列出白名单内激活 provider
 *
 * 退出码：0 成功 / 1 数据或参数错误 / 2 渲染错误
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { validate, type AnymapFeatureCollection } from '@anymap/core';
import { buildMapPage, getProvider, listProviders, DEFAULT_FIT_MAX_ZOOM } from '@anymap/render';

const VERSION = '0.1.0';

function loadFeatureCollection(input: string): unknown {
  const trimmed = input.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed) as unknown;
  const path = trimmed.replace(/^file:\/\//, '');
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function cmdValidate(args: string[]): number {
  const { positionals } = parseArgs({ args, allowPositionals: true });
  if (positionals.length < 1) {
    console.error('用法: anymap validate <geojson 文件 | 内联 JSON>');
    return 1;
  }
  const fc = loadFeatureCollection(positionals[0]!);
  const r = validate(fc);
  if (!r.ok) {
    console.error(`校验失败 (${r.errors.length} 条):`);
    for (const e of r.errors) console.error(`  ✗ ${e}`);
    return 1;
  }
  const coll = fc as { features?: unknown[] };
  console.log(`✓ 校验通过：FeatureCollection，${coll.features?.length ?? 0} 个要素`);
  return 0;
}

function cmdProviders(): number {
  const list = listProviders();
  console.log('合规白名单内已激活 provider:');
  for (const p of list) {
    console.log(`  - ${p.id} (${p.label})  crs=${p.crs}  tiles=${p.rasterTiles.length}  needsKey=${p.needsKey}`);
  }
  console.log('白名单内未激活: tencent / tianditu / baidu（见 docs/provider.md）');
  return 0;
}

function cmdRender(args: string[]): number {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      provider: { type: 'string', default: 'amap' },
      o: { type: 'string' },
      title: { type: 'string' },
      center: { type: 'string' },
      zoom: { type: 'string' },
      'fit-max-zoom': { type: 'string' },
    },
  });
  if (positionals.length < 1) {
    console.error('用法: anymap render <geojson 文件 | 内联 JSON> [--provider amap] [-o out.html] [--title ..] [--center lon,lat] [--zoom n]');
    return 1;
  }
  try {
    const fc = loadFeatureCollection(positionals[0]!);
    const v = validate(fc);
    if (!v.ok) {
      console.error(`数据校验失败 (${v.errors.length} 条):`);
      for (const e of v.errors) console.error(`  ✗ ${e}`);
      return 1;
    }
    const provider = getProvider(values.provider!);
    const center = values.center
      ? (() => {
          const [lon, lat] = values.center.split(',').map(Number);
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new Error(`--center 需为 "lon,lat"，收到 "${values.center}"`);
          return [lon, lat] as [number, number];
        })()
      : undefined;
    const zoom = values.zoom ? Number(values.zoom) : undefined;
    if (zoom !== undefined && (!Number.isFinite(zoom) || zoom < 0 || zoom > 24)) throw new Error(`--zoom 非法: ${values.zoom}`);
    const fitMaxZoom = values['fit-max-zoom'] ? Number(values['fit-max-zoom']) : DEFAULT_FIT_MAX_ZOOM;

    const html = buildMapPage(fc as AnymapFeatureCollection, provider, {
      title: values.title,
      center,
      zoom,
      fitMaxZoom,
    });
    const out = values.o ?? 'out.html';
    writeFileSync(out, html, 'utf8');
    const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
    console.log(`✓ 已渲染 ${out}（${kb} KB，provider=${provider.id}，schemaVer=${(fc as { properties?: { anymap?: { schemaVer?: string } } }).properties?.anymap?.schemaVer ?? '0.1.0'}）`);
    console.log('  浏览器打开即可查看（需联网加载 MapLibre CDN 与底图瓦片）');
    return 0;
  } catch (err) {
    console.error(`渲染失败: ${(err as Error).message}`);
    return 2;
  }
}

function main(): void {
  const { positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: { version: { type: 'boolean', short: 'v' } },
  });
  const [cmd, ...rest] = positionals;
  if ((process.argv as unknown as string[]).includes('--version') || (process.argv as unknown as string[]).includes('-v')) {
    console.log(`anymap ${VERSION}`);
    process.exit(0);
  }
  let code: number;
  switch (cmd) {
    case 'validate': code = cmdValidate(rest); break;
    case 'providers': code = cmdProviders(); break;
    case 'render': code = cmdRender(rest); break;
    default:
      console.error(`用法: anymap <validate|render|providers> [..args]`);
      console.error(`  anymap validate <geojson>`);
      console.error(`  anymap render <geojson> [--provider amap] [-o out.html]`);
      console.error(`  anymap providers`);
      code = 1;
  }
  process.exit(code);
}

main();
