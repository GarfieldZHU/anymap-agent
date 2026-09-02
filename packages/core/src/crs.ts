/**
 * crs.ts — 坐标系声明与 WGS-84 ⇄ GCJ-02 转换（BD-09 预留）。
 *
 * 内部基准 = GCJ-02（与高德/腾讯底图一致）。
 * 算法为公开的国测局火星偏移（GCJ-02）近似模型，精度 ~1m 内，可用于渲染对齐。
 * 转换仅用于显示/渲染；高精度测绘请使用官方服务。
 */

export type Crs = 'GCJ-02' | 'WGS-84' | 'BD-09';

export const DEFAULT_CRS: Crs = 'GCJ-02';

const A = 6378245.0; // 长半轴 (m)
const EE = 0.00669342162296594323; // 偏心率平方

function outOfChina(lon: number, lat: number): boolean {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret =
    -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLon(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
  return ret;
}

/** 将 WGS-84 坐标转为 GCJ-02（火星坐标）。中国境外原样返回。 */
export function wgs84ToGcj02(lon: number, lat: number): [lon: number, lat: number] {
  if (outOfChina(lon, lat)) return [lon, lat];
  let dLat = transformLat(lon - 105.0, lat - 35.0);
  let dLon = transformLon(lon - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI);
  dLon = (dLon * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return [lon + dLon, lat + dLat];
}

/** 将 GCJ-02 坐标反解为 WGS-84。用定点迭代收敛（默认 3 轮，误差 < 1e-6 度）。 */
export function gcj02ToWgs84(lon: number, lat: number, iterations = 3): [lon: number, lat: number] {
  if (outOfChina(lon, lat)) return [lon, lat];
  let wLon = lon;
  let wLat = lat;
  for (let i = 0; i < iterations; i++) {
    const g = wgs84ToGcj02(wLon, wLat);
    wLon -= g[0] - lon;
    wLat -= g[1] - lat;
  }
  return [wLon, wLat];
}

/** 依目标 crs 转换坐标数组（原地不改，返回新数组）。 */
export function convertCoords(
  coords: number[],
  from: Crs,
  to: Crs,
): number[] {
  if (from === to) return [...coords];
  if (from === 'WGS-84' && to === 'GCJ-02') return wgs84ToGcj02(coords[0]!, coords[1]!);
  if (from === 'GCJ-02' && to === 'WGS-84') return gcj02ToWgs84(coords[0]!, coords[1]!);
  throw new Error(`unsupported crs conversion: ${from} -> ${to} (BD-09 预留，未实现)`);
}
