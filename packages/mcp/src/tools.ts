/**
 * tools.ts — anymap MCP 工具实现层（GOALS G4.1 输入面 C：render_map("...")）。
 *
 * 四个工具（与 docs/agent-integration.md §1 预留契约一致）：
 *   - render_map        GeoJSON（内联或文件路径）→ 可移植交互地图页 HTML
 *   - validate_geojson  schema + sym + crs 校验（先跑，错误早暴露）
 *   - providers         列出合规白名单内激活 provider（+未激活指引）
 *   - bounds_of_route   数据外包框/中心/要素数（供 agent 判断视图与范围）
 *
 * 工具与 CLI 共享同一 core/render 实现——MCP 与 shell 调用面行为一致（G4.1 语义等价）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, bboxOf, type AnymapFeatureCollection } from '@anymap/core';
import { buildMapPage, getProvider, listProviders, DEFAULT_FIT_MAX_ZOOM } from '@anymap/render';

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResult {
  text: string;
  isError?: boolean;
}

/** 仓库根（packages/mcp/dist → ../../.. = repo root），供缺省输出目录推导 */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const VERSION = '0.1.0';

/* ---------------- 数据装载（与 CLI 同一语义） ---------------- */

export function loadFeatureCollection(input: string): unknown {
  const trimmed = input.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed) as unknown;
  const path = trimmed.replace(/^file:\/\//, '');
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function describeValidation(input: string): { text: string; isError?: boolean } {
  let fc: unknown;
  try {
    fc = loadFeatureCollection(input);
  } catch (err) {
    return { text: `无法解析 GeoJSON：${(err as Error).message}`, isError: true };
  }
  const r = validate(fc);
  const n = (fc as { features?: unknown[] }).features?.length ?? 0;
  if (!r.ok) {
    return {
      text: `校验失败（${r.errors.length} 条）:\n${r.errors.map((e) => `  ✗ ${e}`).join('\n')}`,
      isError: true,
    };
  }
  const warn = r.warnings.length ? `\n警告（${r.warnings.length} 条）:\n${r.warnings.map((w) => `  ⚠ ${w}`).join('\n')}` : '';
  return { text: `✓ 校验通过：FeatureCollection，${n} 个要素${warn}` };
}

function schemaVerOf(fc: unknown): string {
  return (fc as { properties?: { anymap?: { schemaVer?: string } } }).properties?.anymap?.schemaVer ?? '0.1.0';
}

/* ---------------- 工具实现 ---------------- */

function toolRenderMap(args: Record<string, unknown>): ToolResult {
  const geojson = String(args.geojson ?? '');
  if (!geojson) return { text: 'render_map 需要参数 geojson（内联 JSON 或文件路径）', isError: true };

  let fc: unknown;
  try {
    fc = loadFeatureCollection(geojson);
  } catch (err) {
    return { text: `无法解析 GeoJSON：${(err as Error).message}`, isError: true };
  }
  const v = validate(fc);
  if (!v.ok) {
    return {
      text: `数据校验失败（${v.errors.length} 条），已中止渲染:\n${v.errors.map((e) => `  ✗ ${e}`).join('\n')}\n可先调用 validate_geojson 定位问题`,
      isError: true,
    };
  }

  let provider;
  try {
    provider = getProvider(String(args.provider ?? 'amap'));
  } catch (err) {
    return { text: (err as Error).message, isError: true };
  }

  let out = args.out ? String(args.out) : '';
  if (!out) {
    const dir = join(REPO_ROOT, 'dist', 'mcp-out');
    mkdirSync(dir, { recursive: true });
    out = join(dir, `render-${Date.now()}.html`);
  }

  const center = args.center
    ? (() => {
        const [lon, lat] = String(args.center).split(',').map(Number);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new Error(`center 需为 "lon,lat"，收到 "${String(args.center)}"`);
        return [lon, lat] as [number, number];
      })()
    : undefined;
  const zoom = args.zoom !== undefined && args.zoom !== null ? Number(args.zoom) : undefined;
  const fitMaxZoom = args.fitMaxZoom !== undefined ? Number(args.fitMaxZoom) : DEFAULT_FIT_MAX_ZOOM;

  try {
    const html = buildMapPage(fc as AnymapFeatureCollection, provider, {
      title: args.title ? String(args.title) : undefined,
      center,
      zoom,
      fitMaxZoom,
    });
    writeFileSync(out, html, 'utf8');
    const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
    const bbox = bboxOf(fc as AnymapFeatureCollection);
    const bboxTxt = bbox
      ? `bbox=[${bbox.west.toFixed(5)},${bbox.south.toFixed(5)},${bbox.east.toFixed(5)},${bbox.north.toFixed(5)}]`
      : 'bbox=null';
    return {
      text: [
        `✓ 已渲染 ${resolve(out)}（${kb} KB）`,
        `  指纹: provider=${provider.id} | crs=${provider.crs} | schemaVer=${schemaVerOf(fc)} | ${bboxTxt}`,
        `  浏览器打开即可查看（需联网加载 MapLibre CDN 与底图瓦片）；文件路径可用于直接预览/交付`,
      ].join('\n'),
    };
  } catch (err) {
    return { text: `渲染失败: ${(err as Error).message}`, isError: true };
  }
}

function toolValidate(args: Record<string, unknown>): ToolResult {
  const geojson = String(args.geojson ?? '');
  if (!geojson) return { text: 'validate_geojson 需要参数 geojson（内联 JSON 或文件路径）', isError: true };
  return describeValidation(geojson);
}

function toolProviders(): ToolResult {
  const active = listProviders()
    .map((p) => `  - ${p.id} (${p.label})  crs=${p.crs}  tiles=${p.rasterTiles.length}  needsKey=${p.needsKey}  attribution=${p.attribution}`)
    .join('\n');
  return {
    text: `合规白名单内已激活 provider:\n${active}\n白名单内未激活: tencent / tianditu / baidu（M4 接入，见 docs/provider.md）\n白名单外（Google/Mapbox 等）拒绝注册，仅作海外例外扩展点。`,
  };
}

function crsOf(fc: unknown): string {
  return (fc as { properties?: { anymap?: { crs?: string } } }).properties?.anymap?.crs ?? 'GCJ-02(缺省)';
}

function toolBounds(args: Record<string, unknown>): ToolResult {
  const geojson = String(args.geojson ?? '');
  if (!geojson) return { text: 'bounds_of_route 需要参数 geojson（内联 JSON 或文件路径）', isError: true };
  let fc: unknown;
  try {
    fc = loadFeatureCollection(geojson);
  } catch (err) {
    return { text: `无法解析 GeoJSON：${(err as Error).message}`, isError: true };
  }
  const v = validate(fc);
  if (!v.ok) {
    return { text: `校验失败: ${v.errors.join('; ')}`, isError: true };
  }
  const bbox = bboxOf(fc as AnymapFeatureCollection);
  if (!bbox) return { text: '数据为空（无坐标）', isError: true };
  const center: [number, number] = [(bbox.west + bbox.east) / 2, (bbox.south + bbox.north) / 2];
  const n = (fc as { features?: unknown[] }).features?.length ?? 0;
  return {
    text: JSON.stringify(
      { ok: true, features: n, bbox, center, crs: crsOf(fc) },
      null,
      2,
    ),
  };
}

/* ---------------- 工具注册表（MCP tools/list 直接消费） ---------------- */

export const TOOLS: McpToolDef[] = [
  {
    name: 'render_map',
    description:
      '把 GeoJSON（anymap profile：显式 crs，缺省 GCJ-02）渲染为可移植交互地图页 HTML（MapLibre GL + 合规底图 provider）。返回产物绝对路径与指纹（provider/crs/schemaVer/bbox）。' +
      '坐标系纪律：GCJ-02 直用；WGS-84 由渲染层自动转 GCJ-02；BD-09 报错。合规：provider 仅限白名单 amap|tencent|tianditu|baidu（默认 amap）。',
    inputSchema: {
      type: 'object',
      properties: {
        geojson: { type: 'string', description: 'FeatureCollection：内联 JSON 或文件路径（file: 前缀可选）' },
        provider: { type: 'string', enum: ['amap', 'tencent', 'tianditu', 'baidu'], description: '底图 provider，默认 amap' },
        out: { type: 'string', description: '输出 HTML 路径；缺省写到 <repo>/dist/mcp-out/render-<ts>.html' },
        title: { type: 'string', description: '页面标题' },
        center: { type: 'string', description: '初始视图中心 "lon,lat"；缺省自动 fitBounds' },
        zoom: { type: 'number', description: '初始 zoom（0-24）；缺省 fitBounds 自动' },
        fitMaxZoom: { type: 'number', description: 'fitBounds 最大 zoom，默认 17' },
      },
      required: ['geojson'],
    },
  },
  {
    name: 'validate_geojson',
    description:
      '校验 GeoJSON（anymap profile）：geometry/sym/crs。返回 ok/errors/warnings/要素数。渲染前先跑，错误早暴露；crs 未显式声明会出 warning（缺省 GCJ-02）。',
    inputSchema: {
      type: 'object',
      properties: {
        geojson: { type: 'string', description: 'FeatureCollection：内联 JSON 或文件路径' },
      },
      required: ['geojson'],
    },
  },
  {
    name: 'providers',
    description: '列出合规白名单内已激活的底图 provider（含 crs/瓦片数/是否需要 key/署名）与未激活项及原因。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'bounds_of_route',
    description: '计算 GeoJSON 数据的外包框/中心/要素数（GCJ-02 平面近似），供 agent 判断数据覆盖范围与选择视图。',
    inputSchema: {
      type: 'object',
      properties: {
        geojson: { type: 'string', description: 'FeatureCollection：内联 JSON 或文件路径' },
      },
      required: ['geojson'],
    },
  },
];

/* ---------------- 分发 ---------------- */

export function runTool(name: string, args: Record<string, unknown>): ToolResult {
  switch (name) {
    case 'render_map':
      return toolRenderMap(args);
    case 'validate_geojson':
      return toolValidate(args);
    case 'providers':
      return toolProviders();
    case 'bounds_of_route':
      return toolBounds(args);
    default:
      return { text: `未知工具: ${name}（可用: ${TOOLS.map((t) => t.name).join(', ')}）`, isError: true };
  }
}

export const SERVER_INFO = { name: 'anymap-agent-mcp', version: VERSION };
