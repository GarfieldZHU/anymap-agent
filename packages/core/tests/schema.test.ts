/**
 * schema.test.ts — GeoJSON/sym/crs 校验器行为。
 */
import { describe, expect, it } from 'vitest';
import { validate } from '../src/schema.js';

const base = {
  type: 'FeatureCollection',
  properties: { anymap: { crs: 'GCJ-02' } },
  features: [
    {
      type: 'Feature',
      id: 'p1',
      properties: { sym: 'poi', name: '老君阁' },
      geometry: { type: 'Point', coordinates: [103.560715, 30.90794] },
    },
  ],
};

describe('validate', () => {
  it('合法输入通过', () => {
    const r = validate(base);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('crs 非法报错', () => {
    const bad = structuredClone(base);
    bad.properties.anymap.crs = 'WGS-84X';
    const r = validate(bad);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('crs');
  });

  it('sym 非法报错', () => {
    const bad = structuredClone(base);
    bad.features[0].properties.sym = 'circle';
    const r = validate(bad);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('sym');
  });

  it('坐标非数值报错', () => {
    const bad = structuredClone(base);
    bad.features[0].geometry.coordinates = ['103', 30.9];
    const r = validate(bad);
    expect(r.ok).toBe(false);
  });

  it('LineString 少于 2 点报错', () => {
    const bad = structuredClone(base);
    bad.features[0] = {
      type: 'Feature',
      properties: { sym: 'route' },
      geometry: { type: 'LineString', coordinates: [[103.5, 30.9]] },
    };
    const r = validate(bad);
    expect(r.ok).toBe(false);
  });

  it('顶层非 FeatureCollection 报错', () => {
    expect(validate({ type: 'Point', coordinates: [1, 2] }).ok).toBe(false);
    expect(validate(null).ok).toBe(false);
  });
});
