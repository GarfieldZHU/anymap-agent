# Data Model — 空间数据状态：GeoJSON 唯一状态 + 坐标/投影固化

> 依据 GOALS G3。任何「画什么」都必须表达为 GeoJSON；坐标、投影、schema 是本文件的三根柱子。

## 1. GeoJSON 唯一状态

- 输入/输出/存储统一为 **anymap GeoJSON profile**（RFC 7946 结构超集 + 显式 `crs` 声明）。
  **注意：本 profile 的缺省坐标系是 GCJ-02 而非 RFC 7946 默认的 WGS-84**——因此它不是纯标准 GeoJSON，第三方若按 WGS-84 解读会产生系统性偏移（codex 审查 P0-1）。对外文档一律称 profile，不称“RFC 7946 兼容”。
- 要素几何：`Point`（POI/标点）、`LineString`（路线/轨迹）、`Polygon`（区域）。
- 要素属性：`sym`（渲染语义）+ 业务字段。**渲染器只认 schema，不猜属性名**。

### 1.1 渲染语义 `sym`

| sym | 几何 | 渲染 | 属性约定 |
|---|---|---|---|
| `poi` | Point | 标记 + 可选 label | `name`（label 文本，中文单/多字都支持——MapLibre symbol 层无单字符限制）|
| `route` | LineString | 路线（默认 3px 蓝；`routeColor` 可覆盖）| `order`（途经顺序）、`legId`（分段归属，可选）|
| `area` | Polygon | 区域填充 20% + 边框 | `name` |
| `label` | Point | 纯文本（背景 halo 保证可读）| `name`、`dy`(像素偏移，可选) |

示例（青城山前山登山道一条 leg）：

```jsonc
{
  "type": "FeatureCollection",
  "properties": { "anymap": { "crs": "GCJ-02", "schemaVer": "0.1.0" } },
  "features": [
    { "type": "Feature", "id": "qcs-leg2",
      "properties": { "sym": "route", "name": "天然图画→天师洞", "order": 2, "routeColor": "#2b6cb0" },
      "geometry": { "type": "LineString", "coordinates": [[103.562, 30.897], /* … */] } },
    { "type": "Feature", "id": "qcs-poi-2",
      "properties": { "sym": "poi", "name": "天师洞" },
      "geometry": { "type": "Point", "coordinates": [103.5623, 30.8978] } }
  ]
}
```

## 2. 坐标系（crs）

| crs | 说明 | 使用方 |
|---|---|---|
| `GCJ-02` | 国测局火星坐标，**profile 缺省/内部基准** | 高德、腾讯底图与数据 |
| `WGS-84` | GPS/国际数据；**推荐外部输入显式声明** | 外部输入；渲染边界按需转 GCJ-02 |
| `BD-09` | 百度偏移（预留，v0.1 未实现） | 百度 provider 时启用 |

- FeatureCollection 级 `properties.anymap.crs` 声明数据坐标系；**未声明 → 按 GCJ-02 推断并输出 warning**（validate 返回 warnings，不静默）。
- 转换实现：`crs.ts` 提供 `wgs84ToGcj02 / gcj02ToWgs84`（公开的标准偏移算法，可视化级近似；角度/米制/往返误差与境外样本见 tests/golden 与 crs.test.ts）。BD-09 预留占位，未实现即报错（fail-closed）。
- 转换在渲染边界执行并**改写 crs 声明 + 返回 diagnostics**（inputCrs/outputCrs/要素数/warning），杜绝重复转换（二次 wgs→gcj 会把已偏移数据再偏一次）。

## 3. 投影固化（ll2px 与 Web Mercator）

> 背景：v1–v7 反复出现「线比实际小一圈/偏移 30–50px」，根因 = scale(DPR) 语义错乘 + POI label 按 z+1 渲染（见 ADR-001/002）。MapLibre 引擎内部自动管理投影，**浏览器交互场景不需要 agent 手算像素**；ll2px 服务于：静态导出、golden 断言、以及给 agent 的「地理→像素」确定性。

标准公式（世界坐标 → 瓦片像素，256 瓦片）：

```ts
// zoom 下的世界像素跨度 = 256 * 2^zoom
function lonLatToWorldXY(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n * 256;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * 256;
  return { x, y };
}

// 以中心点(cLon,cLat)为锚，把(lon,lat)投影到 w×h 视口（scale=1 为 CSS 像素）
function ll2px(lon, lat, cLon, cLat, zoom, w, h, scale = 1) {
  const c = lonLatToWorldXY(cLon, cLat, zoom);
  const p = lonLatToWorldXY(lon, lat, zoom);
  return { px: (p.x - c.x) * scale + (w * scale) / 2, py: (p.y - c.y) * scale + (h * scale) / 2 };
}
```

**scale 语义（ADR-001 定案）**：`scale` 是 DPR（devicePixelRatio）——乘法作用在**偏移量**上，不是只乘结果坐标；staticmap 的 scale=2 表示 2× 像素密度。

**lat 越界/clamp**：`|lat| > 85.0511` 在 Web Mercator 无定义，入参即 clamp + warn。

## 4. 工具算子 ops（v0.1）

- `bboxOf(fc)`：要素集合外包框（渲染 fitBounds 用）。
- `simplifyDP(coords, tolerance)`：道格拉斯-普克抽稀（URL 长度限制场景；MapLibre 内一般不需要）。
- `routeLength(coords)`：近似球面长度（米），信息展示用。
- `validate(fc)`：校验 GeoJSON + sym + crs（schema.ts 统一）。

## 5. Schema 版本与指纹

- `packages/core/schema/anymap.schema.json`（JSON Schema draft 2020-12），TS 类型由它生成/对齐。
- 渲染页 footer 输出指纹：`provider | zoom | bbox | schemaVer | coreVer`——问题复现只需报指纹（GOALS G5.4）。
