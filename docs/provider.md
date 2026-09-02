# Provider — 底图提供方抽象与合规白名单

> 依据 GOALS G2。本文定义 provider 注册表、瓦片端点规范与合规流程。

## 1. 合规白名单（强制，编译期 + 运行期双保险）

**中国境内地图数据源仅允许**：高德(AMap)、腾讯(Tencent)、百度(Baidu)、天地图(Tianditu/NASG)。

- 联合类型 `ProviderId = 'amap' | 'tencent' | 'tianditu' | 'baidu'` —— 编译期即拒绝白名单外 id。
- `registry.ts` 运行期 `getProvider(id)` 抛错拒绝未知 id。
- **Google Maps / Mapbox / OSM 直连 / Bing 海外**：境内渲染一律不可用；仅作「海外区域例外」的架构扩展点（见 §4），默认不激活、示例代码不含其瓦片 URL 与 key。

## 2. 注册表定义（v0.1 实现 amap，其余留档）

| id | crs | 瓦片端点（免 key，256px） | 署名 | v0.1 |
|---|---|---|---|---|
| `amap` | GCJ-02 | `https://webrd0{1..4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}`（style=7 为简版） | © 高德地图 | ✅ 默认 |
| `tencent` | GCJ-02 | 需官方 key/代理，v0.1 不内嵌 URL | © 腾讯地图 | ⏳ M4 |
| `tianditu` | CGCS2000/WGS-84 | 需 tk，v0.1 不内嵌 URL | © 天地图 | ⏳ M4 |
| `baidu` | BD-09 | 需 key；注意 crs=BD-09 需转换 | © 百度地图 | ⏳ M4 |

> 高德栅格瓦片为公开端点，与 amap.com 同源审图数据，境内合规；瓦片请求无 key，无前端泄漏面。

## 3. MapLibre 接入规范

```ts
// render/src/providers/amap.ts
export const amap: ProviderDef = {
  id: 'amap', label: '高德地图', crs: 'GCJ-02',
  attribution: '© 高德地图',
  rasterTemplate: (s: number) =>
    `https://webrd0${s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}`,
  needsKey: false,
};

// map.ts 中：RasterTileSource 的 tiles 传 [1,2,3,4].map(rasterTemplate)
// tileSize: 256（高德瓦片物理 256px）
```

- `scale=1` 瓦片为 256px；不要混用 512px tileSize 设置。
- 底图 zoom 范围 3–18（高德栅格可用上限），fitBounds 时 clamp。
- 若某 provider crs ≠ GCJ-02（如 baidu=BD-09），渲染前由 core 将 GeoJSON 转 provider.crs（数据模型见 data-model.md §2）。

## 4. 海外区域例外（架构扩展点，M4 评估）

合规规则（geo-map-compliance-guard）：海外渲染属于「非默认场景」，条件为

1. 数据/视口明确位于境外（如美国行程）；
2. 用户自备并声明使用自己的 key（如 Google/Mapbox 开发者 key）；
3. 代码中 key 一律为占位符 `请到 XX 开放平台申请自己的 key 后替换`，不得内置可用值。

架构上 provider 注册表已支持新增 `google`/`mapbox`（crs=WGS-84），**但默认构建不含其瓦片 URL**；新增需显式开关 + 文档声明合规前提。v0.1 不做，仅此文档留痕。

## 5. Key 管理总则

1. 仓库内任何文件不得出现真实可用 key（CI 用 secret，前端一律占位符或免 key 端点）。
2. 高德 Web 服务 key（检索/路径规划等数据回路）只存在于**服务端脚本**（如 `examples/scripts/`，读取本地 `~/.openclaw/.env.amap`，.gitignore 排除），产物只落 GeoJSON（公开 POI，无个人信息）。
3. 渲染页永不携带 key（v0.1 全为免 key 瓦片端点）。
