/**
 * projection.test.ts — 投影公式的解析性断言 + scale/DPR 语义（ADR-001）。
 */
import { describe, expect, it } from 'vitest';
import {
  lonLatToWorldXY,
  worldXYToLonLat,
  ll2px,
  clampLat,
  MAX_LAT,
  TILE_SIZE,
} from '../src/projection.js';

describe('lonLatToWorldXY 解析边界（强断言）', () => {
  it('zoom=0: 世界 = 单个 256px 瓦片', () => {
    const a = lonLatToWorldXY(-180, 0, 0);
    const b = lonLatToWorldXY(180, 0, 0);
    expect(a.x).toBeCloseTo(0, 6);
    expect(b.x).toBeCloseTo(TILE_SIZE, 6);
    expect(a.y).toBeCloseTo(TILE_SIZE / 2, 6); // lat=0 → 中线
  });

  it('zoom=1: x 跨度 = 512', () => {
    const a = lonLatToWorldXY(-180, 0, 1);
    const b = lonLatToWorldXY(180, 0, 1);
    expect(a.x).toBeCloseTo(0, 6);
    expect(b.x).toBeCloseTo(2 * TILE_SIZE, 6);
  });

  it('纬度 clamp：85.0511… 顶边 y≈0', () => {
    const top = lonLatToWorldXY(0, MAX_LAT, 2);
    expect(top.y).toBeCloseTo(0, 3);
    const over = lonLatToWorldXY(0, 90, 2);
    expect(over.y).toBeCloseTo(top.y, 6); // clamp 后同值
  });

  it('clampLat 拒绝越界', () => {
    expect(clampLat(90)).toBe(MAX_LAT);
    expect(clampLat(-90)).toBe(-MAX_LAT);
    expect(clampLat(30)).toBe(30);
  });
});

describe('互逆：worldXY ⇄ lonLat', () => {
  it('典型点往返误差 < 1e-6 度', () => {
    const z = 15;
    const pts: Array<[number, number]> = [
      [103.560715, 30.90794],
      [104.133737, 30.740536],
      [116.391, 39.907],
      [-74.006, 40.7128], // 纽约（境外）
    ];
    for (const [lon, lat] of pts) {
      const xy = lonLatToWorldXY(lon, lat, z);
      const ll = worldXYToLonLat(xy.x, xy.y, z);
      expect(ll.lon).toBeCloseTo(lon, 6);
      expect(ll.lat).toBeCloseTo(lat, 6);
    }
  });
});

describe('ll2px scale/DPR 语义（ADR-001 定案）', () => {
  const center = [103.566666, 30.903853] as const;
  const target = [103.560715, 30.90794] as const; // 老君阁
  const w = 1200;
  const h = 800;
  const z = 15;

  it('scale=2 结果 == scale=1 结果的 2 倍（锁死“小一圈”回归）', () => {
    const s1 = ll2px(target[0], target[1], center[0], center[1], z, w, h, 1);
    const s2 = ll2px(target[0], target[1], center[0], center[1], z, w, h, 2);
    expect(s2.px).toBeCloseTo(2 * s1.px, 6);
    expect(s2.py).toBeCloseTo(2 * s1.py, 6);
  });

  it('中心点落在视口中心', () => {
    const c = ll2px(center[0], center[1], center[0], center[1], z, w, h, 1);
    expect(c.px).toBeCloseTo(w / 2, 6);
    expect(c.py).toBeCloseTo(h / 2, 6);
  });

  it('scale=2 时中心点落在物理尺寸中心 (w, h)', () => {
    const c = ll2px(center[0], center[1], center[0], center[1], z, w, h, 2);
    expect(c.px).toBeCloseTo(w, 6);
    expect(c.py).toBeCloseTo(h, 6);
  });
});
