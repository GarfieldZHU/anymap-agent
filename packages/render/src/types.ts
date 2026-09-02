/**
 * types.ts — provider 抽象（GOALS G2 / docs/provider.md）。
 * 合规白名单编译期强制：ProviderId 只含境内合规源；Google/Mapbox 不在类型内。
 */
import type { Crs } from '@anymap/core';

export type ProviderId = 'amap' | 'tencent' | 'tianditu' | 'baidu';

export interface ProviderDef {
  id: ProviderId;
  label: string;
  /** 数据/瓦片坐标系（与 GeoJSON 数据坐标系对齐的基准） */
  crs: Crs;
  /** 合规署名（渲染时展示） */
  attribution: string;
  /** 256px XYZ 栅格瓦片 URL（{x}{y}{z} 模板）；v0.1 全为免 key 公开瓦片 */
  rasterTiles: string[];
  tileSize: 256 | 512;
  minZoom: number;
  maxZoom: number;
  needsKey: boolean;
  /** 默认初始 zoom（fitBounds 会覆盖） */
  defaultZoom: number;
}
