/**
 * amap.ts — 高德栅格底图（v0.1 默认 provider）。
 *
 * 瓦片端点：webrd0{1..4}.is.autonavi.com（高德官方栅格瓦片，与 amap.com 同源审图数据，免 key）。
 * style=8 道路版 / style=7 简版；lang=zh_cn&size=1&scale=1 → 256px。
 * 合规：高德在境内白名单；无 key 请求无前端泄漏面（docs/provider.md §2）。
 */
import type { ProviderDef } from '../types.js';

const T = (style: number, s: number) =>
  `https://webrd0${s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=${style}&x={x}&y={y}&z={z}`;

export const amap: ProviderDef = {
  id: 'amap',
  label: '高德地图',
  crs: 'GCJ-02',
  attribution: '© 高德地图',
  rasterTiles: [T(8, 1), T(8, 2), T(8, 3), T(8, 4)],
  tileSize: 256,
  minZoom: 3,
  maxZoom: 18,
  needsKey: false,
  defaultZoom: 15,
};
