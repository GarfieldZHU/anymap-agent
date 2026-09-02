/**
 * projection.ts — Web Mercator 投影固化（GOALS G3 / ADR-001）。
 *
 * 浏览器交互场景由 MapLibre 引擎管理投影，本模块服务于：
 *   1) golden 数学断言（tests/golden）
 *   2) headless 静态图导出（M3）
 *   3) 给 agent 的「地理 → 像素」确定性
 *
 * scale 语义（ADR-001 定案）：scale 是 DPR——乘法作用在偏移量上。
 */

export const TILE_SIZE = 256;
export const MAX_LAT = 85.0511287798066; // Web Mercator 有效纬度上限

/** 经纬度 → zoom 级世界像素坐标（256px 瓦片，范围 [0, 256*2^zoom]）。 */
export function lonLatToWorldXY(
  lon: number,
  lat: number,
  zoom: number,
): { x: number; y: number } {
  const clampedLat = clampLat(lat);
  const n = Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * n * TILE_SIZE;
  const latRad = (clampedLat * Math.PI) / 180;
  const y =
    ((1 -
      Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
      2) *
    n *
    TILE_SIZE;
  return { x, y };
}

/** 纬度 clamp 到 Web Mercator 有效范围（越界会投影到无穷远）。 */
export function clampLat(lat: number): number {
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

export interface Viewport {
  width: number;
  height: number;
  zoom: number;
  /** DPR（CSS 像素 → 物理像素）。默认 1。 */
  scale?: number;
}

/**
 * 以 (cLon,cLat) 为视口中心，把 (lon,lat) 投影到 w×h 视口的像素坐标。
 * 公式见 ADR-001：偏移量整体乘 scale，再加 scale 化的视口半宽。
 */
export function ll2px(
  lon: number,
  lat: number,
  cLon: number,
  cLat: number,
  zoom: number,
  width: number,
  height: number,
  scale = 1,
): { px: number; py: number } {
  const c = lonLatToWorldXY(cLon, cLat, zoom);
  const p = lonLatToWorldXY(lon, lat, zoom);
  return {
    px: (p.x - c.x) * scale + (width * scale) / 2,
    py: (p.y - c.y) * scale + (height * scale) / 2,
  };
}

/** 世界像素 → 经纬度（互逆函数，golden 断言用）。 */
export function worldXYToLonLat(x: number, y: number, zoom: number): { lon: number; lat: number } {
  const n = Math.pow(2, zoom);
  const lon = (x / (n * TILE_SIZE)) * 360 - 180;
  const nf = Math.PI * (1 - (2 * y) / (n * TILE_SIZE));
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(nf) - Math.exp(-nf)));
  return { lon, lat };
}
