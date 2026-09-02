/**
 * crs.test.ts — WGS-84 ⇄ GCJ-02 转换性质断言（互逆 / 境外不变 / 位移量级）。
 */
import { describe, expect, it } from 'vitest';
import { wgs84ToGcj02, gcj02ToWgs84, convertCoords } from '../src/crs.js';

describe('wgs84ToGcj02 基本性质', () => {
  it('境内点产生显著偏移（数百米级 → 经纬度 ~1e-3 度级）', () => {
    const [lon, lat] = wgs84ToGcj02(103.560715, 30.90794); // 老君阁 WGS 输入
    // GCJ-02 相对 WGS-84 在中国大陆通常东/北偏移 100–900m
    const dLon = Math.abs(lon - 103.560715) * 111320 * Math.cos((30.9 * Math.PI) / 180);
    const dLat = Math.abs(lat - 30.90794) * 110540;
    expect(dLon).toBeGreaterThan(50);
    expect(dLon).toBeLessThan(2000);
    expect(dLat).toBeGreaterThan(50);
    expect(dLat).toBeLessThan(2000);
  });

  it('境外点原样返回（GCJ-02 模型只覆盖中国）', () => {
    const [lon, lat] = wgs84ToGcj02(-74.006, 40.7128); // 纽约
    expect(lon).toBe(-74.006);
    expect(lat).toBe(40.7128);
  });
});

describe('互逆：wgs84 ⇄ gcj02', () => {
  it('国内点往返误差 < 1e-6 度（迭代反解收敛）', () => {
    const pts: Array<[number, number]> = [
      [103.560715, 30.90794],
      [104.133737, 30.740536],
      [116.391, 39.907],
      [121.4737, 31.2304],
    ];
    for (const [lon, lat] of pts) {
      const g = wgs84ToGcj02(lon, lat);
      const back = gcj02ToWgs84(g[0], g[1]);
      expect(back[0]).toBeCloseTo(lon, 7);
      expect(back[1]).toBeCloseTo(lat, 7);
    }
  });
});

describe('convertCoords', () => {
  it('同 crs 拷贝返回；WGS→GCJ 正确转发', () => {
    const c = convertCoords([103.560715, 30.90794], 'WGS-84', 'GCJ-02');
    const g = wgs84ToGcj02(103.560715, 30.90794);
    expect(c[0]).toBe(g[0]);
    const same = convertCoords([1, 2], 'GCJ-02', 'GCJ-02');
    expect(same).toEqual([1, 2]);
    expect(() => convertCoords([1, 2], 'WGS-84', 'BD-09')).toThrow();
  });
});
