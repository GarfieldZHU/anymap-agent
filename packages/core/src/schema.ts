/**
 * schema.ts — GeoJSON + sym + crs 轻量校验（无运行时依赖的手写校验器）。
 * 全链路 schema 锚点：anymap.schema.json 的 TS 视图（GOALS G3.5）。
 */

import type { AnymapFeatureCollection } from './geo.js';

export type { AnymapFeatureCollection } from './geo.js';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** 非致命问题（如 crs 未显式声明时的缺省推断） */
  warnings: string[];
}

const SYMS = new Set(['poi', 'route', 'area', 'label']);
const CRSES = new Set(['GCJ-02', 'WGS-84', 'BD-09']);
const GEOM_TYPES = new Set(['Point', 'LineString', 'Polygon']);

const SYM_BY_GEOM: Record<string, string> = {
  Point: 'poi',
  LineString: 'route',
  Polygon: 'area',
};

function isNumArray(v: unknown, min: number): v is number[] {
  return Array.isArray(v) && v.length >= min && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

function validCoord(v: unknown): boolean {
  return isNumArray(v, 2) && (v as number[]).length <= 3;
}

function validateGeometry(geom: unknown, path: string, errors: string[]): void {
  if (typeof geom !== 'object' || geom === null) {
    errors.push(`${path}: geometry 缺失`);
    return;
  }
  const g = geom as { type?: unknown; coordinates?: unknown };
  if (typeof g.type !== 'string' || !GEOM_TYPES.has(g.type)) {
    errors.push(`${path}: geometry.type 必须是 Point|LineString|Polygon`);
    return;
  }
  const coords = g.coordinates;
  if (g.type === 'Point') {
    if (!validCoord(coords)) errors.push(`${path}: Point.coordinates 必须是 [lon,lat]`);
  } else if (g.type === 'LineString') {
    if (!Array.isArray(coords) || coords.length < 2 || !coords.every(validCoord))
      errors.push(`${path}: LineString.coordinates 至少 2 个 [lon,lat]`);
  } else if (g.type === 'Polygon') {
    if (
      !Array.isArray(coords) ||
      coords.length < 1 ||
      !coords.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(validCoord))
    )
      errors.push(`${path}: Polygon.coordinates 须为含 ≥4 点环的数组`);
  }
}

/**
 * 校验 FeatureCollection：结构 + sym + crs。返回 { ok, errors, warnings }。
 * - crs 契约（P0-1 采纳）：本格式是「anymap GeoJSON profile」而非纯 RFC 7946——
 *   显式声明是推荐做法；缺省按 GCJ-02 推断并给出 warning（fail-open 但可追踪），
 *   不冒充标准 WGS-84 GeoJSON。
 * - sym 未显式声明时按几何推断（Point→poi…），推断成功不报错。
 */
export function validate(fc: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (typeof fc !== 'object' || fc === null || (fc as { type?: unknown }).type !== 'FeatureCollection') {
    return { ok: false, errors: ['顶层必须是 FeatureCollection'], warnings };
  }
  const coll = fc as AnymapFeatureCollection;
  if (!Array.isArray(coll.features)) {
    return { ok: false, errors: ['features 必须是数组'], warnings };
  }

  const crs = coll.properties?.anymap?.crs;
  if (crs !== undefined && !CRSES.has(crs as string)) {
    errors.push(`properties.anymap.crs 必须是 GCJ-02|WGS-84|BD-09，收到 ${String(crs)}`);
  } else if (crs === undefined) {
    warnings.push('properties.anymap.crs 未声明：按 GCJ-02（anymap profile）推断；外部 WGS-84 数据请显式声明以避免偏移');
  }

  coll.features.forEach((f, i) => {
    const p = `features[${i}]`;
    if (f.type !== 'Feature') {
      errors.push(`${p}: 必须是 Feature`);
      return;
    }
    validateGeometry(f.geometry, `${p}.geometry`, errors);
    const props = (f.properties ?? {}) as { sym?: unknown };
    if (props.sym !== undefined && !SYMS.has(props.sym as string)) {
      errors.push(`${p}: properties.sym 必须是 poi|route|area|label，收到 ${String(props.sym)}`);
    }
    if (f.properties?.routeColor !== undefined && typeof f.properties.routeColor !== 'string') {
      errors.push(`${p}: properties.routeColor 必须是颜色字符串`);
    }
  });

  return { ok: errors.length === 0, errors, warnings };
}

export { SYMS, SYM_BY_GEOM };
