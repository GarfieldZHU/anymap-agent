/**
 * golden.test.ts — golden 数据集断言（docs/verification.md §2）。
 * 锁定：真实地标投影锚点（防公式回归）+ 一致性。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lonLatToWorldXY } from '../src/projection.js';

const fixtures = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../tests/golden/fixtures.json'), 'utf8'),
) as {
  landmarks: Array<{ name: string; lon: number; lat: number; zoom: number; worldXY: { x: number; y: number } | null }>;
};

describe('golden landmarks（防投影公式回归）', () => {
  it('fixtures 已回填 anchors（先跑 npm run prepare:golden）', () => {
    const missing = fixtures.landmarks.filter((l) => !l.worldXY);
    expect(missing).toEqual([]);
  });

  it('每个地标 lonLatToWorldXY 与锚点一致（容差 1e-6 px）', () => {
    for (const lm of fixtures.landmarks) {
      const { x, y } = lonLatToWorldXY(lm.lon, lm.lat, lm.zoom);
      expect(x, `${lm.name} x`).toBeCloseTo(lm.worldXY!.x, 3);
      expect(y, `${lm.name} y`).toBeCloseTo(lm.worldXY!.y, 3);
    }
  });
});
