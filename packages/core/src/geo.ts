/**
 * geo.ts — GeoJSON（RFC 7946 子集）类型 + anymap 渲染语义（sym）。
 */

export type Position = [number, number]; // [lon, lat]，扩展可 [lon, lat, alt]

export type GeomType = 'Point' | 'LineString' | 'Polygon';

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: Position;
}
export interface GeoJsonLineString {
  type: 'LineString';
  coordinates: Position[];
}
export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: Position[][];
}
export type Geometry = GeoJsonPoint | GeoJsonLineString | GeoJsonPolygon;

/** 渲染语义：渲染器只认 sym，不猜属性名（GOALS G3.4）。 */
export type SymType = 'poi' | 'route' | 'area' | 'label';

export interface SymProps {
  sym: SymType;
  name?: string;
  /** route 途经顺序（可选，用于排序/绘制箭头方向） */
  order?: number;
  routeColor?: string;
  /** label 垂直像素偏移（可选） */
  dy?: number;
}

export interface AnymapMeta {
  crs: 'GCJ-02' | 'WGS-84' | 'BD-09';
  schemaVer?: string;
  source?: string;
}

export interface AnymapFeature<P = SymProps> {
  type: 'Feature';
  id?: string | number;
  properties: P;
  geometry: Geometry;
}

export interface AnymapFeatureCollection {
  type: 'FeatureCollection';
  features: AnymapFeature[];
  properties?: {
    anymap?: Partial<AnymapMeta>;
    name?: string;
    description?: string;
  };
}
