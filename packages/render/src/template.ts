/**
 * template.ts — 可移植交互地图页生成器（GOALS G6 / docs/architecture.md §6）。
 *
 * 输出单文件 HTML：内联 GeoJSON + CDN MapLibre GL + provider 栅格底图 + GeoJSON 矢量层。
 * 注意：产物依赖联网（MapLibre CDN + 远程瓦片），非离线单文件（P0-5 措辞采纳）。
 * - 坐标系：页面按数据声明 crs 处理（GCJ-02 直用；WGS-84 用内联转换函数转 GCJ-02；BD-09 报错）
 * - 安全：数据经 \\u003c 转义防 `</script>`；popup 注入文本一律 HTML 转义；产物带 CSP
 * - 工具条：路线/区域/标注显隐、矢量层透明度、复位视图
 * - 点击要素 → popup（名称 + GCJ-02/WGS-84 坐标）
 * - footer 指纹：provider | zoom | bbox | schemaVer | maplibre 版本 | 生成时间（GOALS G5.4）
 */
import type { AnymapFeatureCollection, BBox, Crs } from '@anymap/core';
import { MAPLIBRE_CDN_VERSION, FONT_SERVER, CORE_SCHEMA_VER } from './constants.js';
import type { ProviderDef } from './types.js';

export interface RenderOptions {
  title?: string;
  /** 显式初始视图；缺省自动 fitBounds 到数据范围 */
  center?: [number, number];
  zoom?: number;
  /** fitBounds 时上下左右 padding（px），默认 60 */
  fitPadding?: number;
  /** fitBounds maxZoom（防止过小范围被拉到无瓦片层级），默认 17 */
  fitMaxZoom?: number;
}

export const DEFAULT_FIT_MAX_ZOOM = 17;

function escapeJsonForScript(json: unknown): string {
  // 防 `</script>` 提前闭合：\u003c 在 JSON.parse 时还原为 '<'
  return JSON.stringify(json).replace(/</g, '\\u003c');
}

function buildPageScript(
  fc: AnymapFeatureCollection,
  provider: ProviderDef,
  opts: RenderOptions,
  bbox: BBox | null,
): string {
  const dataJson = escapeJsonForScript(fc);
  const providerJson = escapeJsonForScript({
    tiles: provider.rasterTiles,
    attribution: provider.attribution,
    label: provider.label,
    id: provider.id,
    maxZoom: provider.maxZoom,
  });
  const bboxJson = bbox ? escapeJsonForScript(bbox) : 'null';
  const centerJson = opts.center ? escapeJsonForScript(opts.center) : 'null';
  const zoomVal = opts.zoom ?? null;
  const fitPadding = opts.fitPadding ?? 60;
  const fitMaxZoom = opts.fitMaxZoom ?? DEFAULT_FIT_MAX_ZOOM;
  const title = (opts.title ?? 'anymap render').replace(/[<>&"']/g, '');
  const generatedAt = new Date().toISOString();

  // ⚠️ 页面 JS 内禁止使用反引号与 `${`（本模板以字符串拼接实现），避免与 Node 端模板冲突。
  // 中文字符串保持 UTF-8；坐标转换函数来自 @anymap/core crs.ts（v0.1.0 内联）。
  return `
(function () {
  'use strict';
  var RAW = JSON.parse(document.getElementById('anymap-data').textContent);
  var DECLARED_CRS = (RAW.properties && RAW.properties.anymap && RAW.properties.anymap.crs) || 'GCJ-02';
  var PROVIDER_CRS = 'GCJ-02'; // v0.1 所有激活 provider 均为 GCJ-02

  // ---- crs 内联工具（@anymap/core crs.ts, wgs84ToGcj02/gcj02ToWgs84）----
  var A = 6378245.0, EE = 0.00669342162296594323;
  function outOfChina(lon, lat) { return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271; }
  function tLat(x, y) {
    var ret = -100.0 + 2.0*x + 3.0*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
    ret += (20.0*Math.sin(6.0*x*Math.PI) + 20.0*Math.sin(2.0*x*Math.PI)) * 2.0/3.0;
    ret += (20.0*Math.sin(y*Math.PI) + 40.0*Math.sin((y/3.0)*Math.PI)) * 2.0/3.0;
    ret += (160.0*Math.sin((y/12.0)*Math.PI) + 320*Math.sin((y*Math.PI)/30.0)) * 2.0/3.0;
    return ret;
  }
  function tLon(x, y) {
    var ret = 300.0 + x + 2.0*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
    ret += (20.0*Math.sin(6.0*x*Math.PI) + 20.0*Math.sin(2.0*x*Math.PI)) * 2.0/3.0;
    ret += (20.0*Math.sin(x*Math.PI) + 40.0*Math.sin((x/3.0)*Math.PI)) * 2.0/3.0;
    ret += (150.0*Math.sin((x/12.0)*Math.PI) + 300.0*Math.sin((x/30.0)*Math.PI)) * 2.0/3.0;
    return ret;
  }
  function wgsToGcj(lon, lat) {
    if (outOfChina(lon, lat)) return [lon, lat];
    var dLat = tLat(lon - 105.0, lat - 35.0), dLon = tLon(lon - 105.0, lat - 35.0);
    var radLat = (lat/180.0)*Math.PI, magic = Math.sin(radLat);
    magic = 1 - EE*magic*magic;
    var sm = Math.sqrt(magic);
    dLat = (dLat*180.0) / (((A*(1-EE))/(magic*sm))*Math.PI);
    dLon = (dLon*180.0) / ((A/sm)*Math.cos(radLat)*Math.PI);
    return [lon + dLon, lat + dLat];
  }
  function gcjToWgs(lon, lat) {
    if (outOfChina(lon, lat)) return [lon, lat];
    var wLon = lon, wLat = lat, g, i;
    for (i = 0; i < 3; i++) { g = wgsToGcj(wLon, wLat); wLon -= g[0]-lon; wLat -= g[1]-lat; }
    return [wLon, wLat];
  }

  var FC = RAW;
  if (DECLARED_CRS !== PROVIDER_CRS) {
    if (DECLARED_CRS === 'WGS-84') {
      FC = JSON.parse(JSON.stringify(RAW)); // 深拷贝后原地转换
      FC.features.forEach(function (f) {
        var g = f.geometry;
        if (g.type === 'Point') g.coordinates = wgsToGcj(g.coordinates[0], g.coordinates[1]);
        else if (g.type === 'LineString') g.coordinates = g.coordinates.map(function (c) { return wgsToGcj(c[0], c[1]); });
        else if (g.type === 'Polygon') g.coordinates = g.coordinates.map(function (ring) { return ring.map(function (c) { return wgsToGcj(c[0], c[1]); }); });
      });
      FC.properties = FC.properties || {}; FC.properties.anymap = FC.properties.anymap || {};
      FC.properties.anymap.crs = 'GCJ-02';
    } else {
      throw new Error('不支持的 crs: ' + DECLARED_CRS + '（v0.1 仅支持 GCJ-02 / WGS-84）');
    }
  }

  var BBOX = ${bboxJson};
  var map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      glyphs: '${FONT_SERVER}',
      sources: {},
      layers: []
    },
    center: ${centerJson} || (BBOX ? [(BBOX.west+BBOX.east)/2, (BBOX.south+BBOX.north)/2] : [103.5, 30.7]),
    zoom: ${zoomVal} ?? (BBOX ? 12 : 8),
    attributionControl: false,
    maxZoom: ${provider.maxZoom}
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

  var PROVIDER = ${providerJson};
  map.addSource('basemap', {
    type: 'raster',
    tiles: PROVIDER.tiles,
    tileSize: 256,
    attribution: PROVIDER.attribution,
    maxzoom: PROVIDER.maxZoom
  });
  map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap' });

  map.addSource('anymap', { type: 'geojson', data: FC });
  var S = { sym: ['get', 'sym'] };

  // route（LineString；索道/接驳等直连线由 routeColor 区分，不做 dash 以免渲染歧义）
  map.addLayer({
    id: 'route-line', type: 'line', source: 'anymap',
    filter: ['==', S.sym, 'route'],
    paint: {
      'line-color': ['coalesce', ['get', 'routeColor'], '#2b6cb0'],
      'line-width': 4,
      'line-opacity': 0.9
    }
  });
  // area（Polygon）
  map.addLayer({
    id: 'area-fill', type: 'fill', source: 'anymap',
    filter: ['==', S.sym, 'area'],
    paint: { 'fill-color': ['coalesce', ['get', 'routeColor'], '#38a169'], 'fill-opacity': 0.16 }
  });
  map.addLayer({
    id: 'area-outline', type: 'line', source: 'anymap',
    filter: ['==', S.sym, 'area'],
    paint: { 'line-color': ['coalesce', ['get', 'routeColor'], '#38a169'], 'line-width': 1.5 }
  });
  // poi 圆点
  map.addLayer({
    id: 'poi-dot', type: 'circle', source: 'anymap',
    filter: ['==', S.sym, 'poi'],
    paint: {
      'circle-radius': 5, 'circle-color': '#e53e3e', 'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff'
    }
  });
  // poi + label 文本
  map.addLayer({
    id: 'feat-label', type: 'symbol', source: 'anymap',
    filter: ['in', S.sym, ['literal', ['poi', 'label']]],
    layout: {
      'text-field': ['coalesce', ['get', 'name'], ''],
      'text-font': ['literal', ['Noto Sans Regular']],
      'text-size': 12.5,
      'text-offset': [0, 1.3],
      'text-anchor': 'top'
    },
    paint: {
      'text-halo-color': '#ffffff', 'text-halo-width': 1.6, 'text-color': '#1a202c'
    }
  });

  function collectVectorLayerIds() {
    return ['route-line', 'area-fill', 'area-outline', 'poi-dot', 'feat-label'];
  }

  // ---- 工具条逻辑 ----
  function bindCheck(id, layerIds) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', function () {
      layerIds.forEach(function (lid) {
        var l = map.getLayer(lid);
        if (l) map.setLayoutProperty(lid, 'visibility', el.checked ? 'visible' : 'none');
      });
    });
  }
  bindCheck('ctl-routes', ['route-line']);
  bindCheck('ctl-areas', ['area-fill', 'area-outline']);
  bindCheck('ctl-points', ['poi-dot', 'feat-label']);

  var opacityEl = document.getElementById('ctl-opacity');
  if (opacityEl) {
    opacityEl.addEventListener('input', function () {
      var v = Number(opacityEl.value);
      ['route-line', 'area-fill', 'area-outline', 'poi-dot'].forEach(function (lid) {
        var l = map.getLayer(lid);
        if (!l) return;
        var prop = l.type === 'fill' ? 'fill-opacity' : l.type === 'line' ? 'line-opacity' : 'circle-opacity';
        map.setPaintProperty(lid, prop, v);
      });
    });
  }
  var resetEl = document.getElementById('ctl-reset');
  if (resetEl && BBOX) {
    resetEl.addEventListener('click', function () {
      map.fitBounds([[BBOX.west, BBOX.south], [BBOX.east, BBOX.north]], {
        padding: ${fitPadding}, maxZoom: ${fitMaxZoom}
      });
    });
  }

  // ---- 点击查询（安全边界：所有注入 popup 的文本先 HTML 转义，P0-5 采纳）----
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var clickableLayers = collectVectorLayerIds();
  map.on('click', clickableLayers, function (e) {
    if (!e.features || e.features.length === 0) return;
    var f = e.features[0];
    var geom = f.geometry || {};
    var c = geom.type === 'Point' ? geom.coordinates
      : geom.type === 'LineString' ? geom.coordinates[0]
      : (geom.coordinates && geom.coordinates[0]) ? geom.coordinates[0][0] : null;
    var g = f.properties || {};
    var lines = ['<div class="pop-title">' + escapeHtml(g.name || g.sym || '要素') + '</div>'];
    lines.push('<div class="pop-row">类型：' + escapeHtml(g.sym || '') + '</div>');
    if (g.order != null) lines.push('<div class="pop-row">顺序：' + escapeHtml(g.order) + '</div>');
    if (c) {
      var w = gcjToWgs(c[0], c[1]);
      lines.push('<div class="pop-row">GCJ-02: ' + escapeHtml(Number(c[0]).toFixed(6)) + ', ' + escapeHtml(Number(c[1]).toFixed(6)) + '</div>');
      lines.push('<div class="pop-row">WGS-84: ' + escapeHtml(Number(w[0]).toFixed(6)) + ', ' + escapeHtml(Number(w[1]).toFixed(6)) + '</div>');
    }
    new maplibregl.Popup({ closeButton: false, maxWidth: '280px' })
      .setLngLat([c ? c[0] : e.lngLat.lng, c ? c[1] : e.lngLat.lat])
      .setHTML(lines.join(''))
      .addTo(map);
  });
  map.on('mouseenter', clickableLayers, function () { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', clickableLayers, function () { map.getCanvas().style.cursor = ''; });

  // ---- 初始视图 ----
  if (${centerJson} === null && BBOX) {
    map.fitBounds([[BBOX.west, BBOX.south], [BBOX.east, BBOX.north]], {
      padding: ${fitPadding}, maxZoom: ${fitMaxZoom}
    });
  }

  // ---- footer 指纹 ----
  var fp = document.getElementById('fingerprint');
  if (fp) {
    var z = BBOX ? Math.round(map.getZoom() * 100) / 100 : ${zoomVal ?? 'null'};
    fp.textContent = 'provider=' + PROVIDER.id + ' | crs=GCJ-02 | bbox=' + JSON.stringify(BBOX) +
      ' | schemaVer=${CORE_SCHEMA_VER} | maplibre=' + maplibregl.version + ' | ' + '${generatedAt}';
    map.on('moveend', function () {
      var bb = map.getBounds();
      fp.textContent = 'provider=' + PROVIDER.id + ' | zoom=' + (Math.round(map.getZoom() * 100) / 100) +
        ' | bbox=[' + bb.getWest().toFixed(5) + ',' + bb.getSouth().toFixed(5) + ',' + bb.getEast().toFixed(5) + ',' + bb.getNorth().toFixed(5) + ']' +
        ' | schemaVer=${CORE_SCHEMA_VER} | maplibre=' + maplibregl.version + ' | ' + '${generatedAt}';
    });
  }
})();
`;
}

/** 生成自包含 HTML 页面。 */
export function buildMapPage(fc: AnymapFeatureCollection, provider: ProviderDef, opts: RenderOptions = {}): string {
  return html(fc, provider, opts);
}

function html(fc: AnymapFeatureCollection, provider: ProviderDef, opts: RenderOptions): string {
  const bbox = computeBBox(fc);
  const script = buildPageScript(fc, provider, opts, bbox);
  const title = (opts.title ?? 'anymap render').replace(/[<>&"']/g, '');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'self' https: data: blob:; script-src 'self' https: 'unsafe-inline'; style-src 'self' https: 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self' https: data: blob:; font-src 'self' https: data:">
<link href="https://unpkg.com/maplibre-gl@${MAPLIBRE_CDN_VERSION}/dist/maplibre-gl.css" rel="stylesheet">
<style>
  html, body { margin: 0; padding: 0; height: 100%; font-family: -apple-system, 'PingFang SC', 'Noto Sans SC', sans-serif; }
  #map { position: absolute; inset: 0; }
  .toolbar {
    position: absolute; top: 10px; right: 10px; z-index: 10;
    background: rgba(255,255,255,.96); border-radius: 8px; box-shadow: 0 1px 6px rgba(0,0,0,.18);
    padding: 10px 12px; font-size: 12.5px; color: #1a202c; width: 190px;
  }
  .toolbar h1 { font-size: 13px; margin: 0 0 8px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
  .toolbar label { display: flex; align-items: center; gap: 6px; margin: 5px 0; cursor: pointer; }
  .toolbar .op-row { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
  .toolbar input[type=range] { flex: 1; }
  .toolbar button { margin-top: 6px; width: 100%; padding: 3px 0; font-size: 12px; cursor: pointer; }
  .attribution-note { font-size: 10px; color: #718096; margin-top: 6px; }
  .pop-title { font-weight: 600; margin-bottom: 2px; }
  .pop-row { font-size: 12px; color: #2d3748; }
  #fingerprint {
    position: absolute; left: 8px; bottom: 6px; z-index: 10;
    font-size: 10px; color: #4a5568; background: rgba(255,255,255,.72);
    padding: 2px 6px; border-radius: 4px; pointer-events: none;
  }
</style>
</head>
<body>
<div id="map"></div>
<div class="toolbar" id="toolbar">
  <h1>${title}</h1>
  <label><input type="checkbox" id="ctl-routes" checked> 路线</label>
  <label><input type="checkbox" id="ctl-areas" checked> 区域</label>
  <label><input type="checkbox" id="ctl-points" checked> 标注点</label>
  <div class="op-row">透明 <input type="range" id="ctl-opacity" min="0" max="1" step="0.05" value="0.9"></div>
  <button id="ctl-reset">复位视图</button>
  <div class="attribution-note">底图：${provider.attribution} · 矢量层数据：GeoJSON (crs=GCJ-02)</div>
</div>
<div id="fingerprint"></div>
<script id="anymap-data" type="application/json">${escapeJsonForScript(fc)}</script>
<script src="https://unpkg.com/maplibre-gl@${MAPLIBRE_CDN_VERSION}/dist/maplibre-gl.js"></script>
<script>${script}</script>
</body>
</html>
`;
}

function computeBBox(fc: AnymapFeatureCollection): BBox | null {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  const visit = (c: number[]) => {
    const lon = c[0]!, lat = c[1]!;
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  };
  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type === 'Point') visit(g.coordinates);
    else if (g.type === 'LineString') g.coordinates.forEach(visit);
    else if (g.type === 'Polygon') (g.coordinates as number[][][]).forEach((ring) => ring.forEach(visit));
  }
  if (west === Infinity) return null;
  return { west, south, east, north };
}
