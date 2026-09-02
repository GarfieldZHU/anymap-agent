/**
 * ops.ts — GeoJSON 常用算子（纯函数）：bbox / 抽稀 / 球面长度。
 */

import type { AnymapFeatureCollection, Position } from './geo.js';

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** 外包框（GCJ-02 平面近似，足够 fitBounds 使用）。空集合返回 null。 */
export function bboxOf(fc: AnymapFeatureCollection): BBox | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const f of fc.features) {
    for (const [lon, lat] of eachPosition(f.geometry)) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  if (west === Infinity) return null;
  return { west, south, east, north };
}

/** 遍历几何内所有 [lon,lat]（生成器）。 */
export function* eachPosition(geom: {
  type: 'Point' | 'LineString' | 'Polygon';
  coordinates: unknown;
}): Generator<Position> {
  if (geom.type === 'Point') {
    yield geom.coordinates as unknown as Position;
  } else if (geom.type === 'LineString') {
    for (const p of geom.coordinates as unknown as Position[]) yield p;
  } else if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates as unknown as Position[][]) {
      for (const p of ring) yield p;
    }
  }
}

/** 道格拉斯-普克抽稀：返回简化后的点数组。tolerance 单位 = 度（WGS/GCJ 平面近似）。 */
export function simplifyDP(coords: Position[], tolerance: number): Position[] {
  if (coords.length <= 2) return coords.slice();
  const keep = new Uint8Array(coords.length);
  keep[0] = 1;
  keep[coords.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, coords.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDist(coords[i]!, coords[first]!, coords[last]!);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index !== -1) {
      keep[index] = 1;
      stack.push([first, index]);
      stack.push([index, last]);
    }
  }

  const out: Position[] = [];
  for (let i = 0; i < coords.length; i++) if (keep[i]) out.push(coords[i]!);
  return out;
}

function perpendicularDist(p: Position, a: Position, b: Position): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const EARTH_R = 6371008.8; // 平均半径 m

/** 球面近似长度（米）。对 GCJ/WGS 平面坐标足够（渲染级）。 */
export function routeLengthMeters(coords: Position[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1]!;
    const [lon2, lat2] = coords[i]!;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const la1 = lat1 * rad;
    const la2 = lat2 * rad;
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    total += 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return total;
}
