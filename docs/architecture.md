# Architecture — anymap-agent 总体架构

> 依据 [GOALS.md](../GOALS.md) 编写。本文描述模块划分、数据流、技术选型与目录结构，是实现的蓝图。

## 1. 架构原则

1. **渲染内核独立**：MapLibre GL JS 是唯一渲染内核；provider 只提供「底图瓦片 + 坐标体系」，不参与 GeoJSON 解释。
2. **状态与表现分离**：空间数据（GeoJSON）与样式指令（schema 属性）是状态；像素、图层是表现。Agent 只写状态，引擎渲染表现。
3. **坐标体系贯穿**：库边界处显式声明 `crs`，默认 GCJ-02；WGS-84 入站自动转换；任何跨体系操作必须有转换记录。
4. **合规进类型**：provider 白名单同时约束 TS 联合类型与运行时注册表，未白名单 provider 无法通过编译与运行两道校验。
5. **可验证优先**：core 为纯函数库（无 DOM 依赖），全部逻辑可单测；渲染层只做薄封装。

## 2. 模块划分（npm workspaces monorepo）

```
anymap-agent/
├── GOALS.md                 # 纲领（最高指导）
├── AGENTS.md                # 给 codex / 任意 agent 的接入约定
├── docs/                    # 设计与 ADR
├── packages/
│   ├── core/                # 纯 TS，零运行时依赖
│   │   ├── src/crs.ts       #   crs 类型 & wgs84<->gcj02 (bd09 预留)
│   │   ├── src/projection.ts#   Web Mercator worldXY / ll2px（scale 语义固定）
│   │   ├── src/geo.ts       #   GeoJSON 类型（TS 复刻 RFC7946 子集）
│   │   ├── src/schema.ts    #   anymap.schema.json 的 TS 视图 + validate()
│   │   └── src/ops.ts       #   抽稀(DP)、bounds、长度/面积(近似)
│   ├── render/              # 浏览器侧渲染
│   │   ├── src/providers/   #   amap.ts(默认) / tencent.ts / tianditu.ts / baidu.ts / registry.ts
│   │   ├── src/map.ts       #   MapLibre 工厂：provider 底图 + GeoJSON 矢量层 + 工具条
│   │   └── src/template.ts  #   自包含 HTML 模板（内联数据，可分享）
│   ├── cli/                 # Node CLI：render / validate / provider-list
│   └── mcp/                 # (M2) MCP server（stdio），v0.1 只留 schema 与文档
├── examples/
│   ├── data/*.geojson       # 成都三景点 + 检索示例（真实数据脱敏/注明来源）
│   └── scripts/             # 从高德 Web API 拉数据生成 GeoJSON（合规：公开 POI）
├── tests/golden/            # 像素/坐标 golden 数据集（入库，CI 消费）
└── .github/workflows/ci.yml # lint + test + build + Pages
```

## 3. 核心数据流

```
                        ┌─────────────────────────────────────────────┐
   Agent 输入            │  anymap-agent                              │
 ┌────────────┐  GeoJSON │  ┌──────────┐  validate  ┌──────────────┐ │
 │ 一句话任务   │ ───────▶│  │  cli/mcp │ ─────────▶ │  core        │ │
 │ JSON/文件   │  +参数   │  │  (schema)│  (schema)  │  crs/proj/ops │ │
 └────────────┘          │  └──────────┘            └──────┬───────┘ │
                         │                                 │ 规范化 GeoJSON
                         │                                 ▼         │
                         │  ┌──────────────────────────────────────┐ │
                         │  │ render/map.ts                        │ │
                         │  │  MapLibre GL JS                      │ │
                         │  │   ├ 底图: providers[amap].raster     │ │
                         │  │   ├ 矢量: GeoJSON→layer(symbol/line/ │ │
                         │  │   │        fill) 按 schema 属性解释   │ │
                         │  │   └ 交互: 显隐/缩放/点查 popup/标定    │ │
                         │  └──────────────────────────────────────┘ │
                         └──────────────────────┬─────────────────────┘
                                                ▼
                                   自包含 HTML（out.html）→ 浏览器打开
```

## 4. 关键技术决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 渲染内核 | MapLibre GL JS（npm `maplibre-gl`） | GOALS G1：开源、免 key、provider 无关、矢量/栅格通吃 |
| 底图默认 | 高德栅格瓦片（`webrd0N.is.autonavi.com`，无 key） | 用户指定高德先行；与 amap.com 同源审图数据；GCJ-02 |
| 坐标系 | GCJ-02 为内部基准 | 国内 provider 原生；避免 v5 系列「底图/数据坐标系不一致」错位 |
| 包管理 | npm workspaces | 纯 node 生态一致；core 零依赖便于未来 Rust/wasm 对标 |
| 构建 | tsup（lib）+ vite（demo） | core/cli 出 ESM+CJS；render demo 出静态页 |
| 测试 | vitest（core 纯函数）+ demo 冒烟 | CI 无头环境无法跑 WebGL，golden 像素断言全放 core 数学层 |
| 语言 | TypeScript（v0.1）；Rust 见 G6/M3 | MapLibre 生态即 TS；Rust 作交叉实现与高性能代理（按需） |

## 5. Provider 运行时模型

```ts
// registry 是唯一合法入口：编译期白名单（联合类型）+ 运行期校验
type ProviderId = 'amap' | 'tencent' | 'tianditu' | 'baidu';

interface ProviderDef {
  id: ProviderId;
  label: string;
  crs: 'GCJ-02' | 'BD-09';
  attribution: string;            // 合规署名（渲染时显示）
  rasterTemplate: (sub: number) => string;  // 256px XYZ 瓦片 URL 模板
  needsKey: false;                 // v0.1 一律免 key 公开瓦片；需 key 的走非默认流程
}
```

MapLibre 侧每个 provider 实例化为 `RasterTileSource` + `GeoJSONSource` 矢量层。**切换 provider 仅换 source**，GeoJSON 不动（若 crs 不同由 core 预先转换）。

## 6. 渲染页能力清单（v0.1 验收）

1. 底图按 provider 渲染，右下角合规署名。
2. GeoJSON 图层按 schema 解释：`marker`（含 label）、`route`（线宽/虚线/箭头可选）、`area`（面填充）、`label`（文本）。
3. 工具条：图层显隐、透明度、fit-bounds、坐标显示（点击复制 GCJ-02/WGS-84）。
4. 自描述指纹：页面 footer 打印 `provider/zoom/bbox/schemaVer/coreVer`（G5.4 复现依据）。
5. 单文件可移植 HTML（内联 GeoJSON + CDN MapLibre + 远程瓦片；**联网依赖显式声明**，非离线单文件）。
6. 安全基线（P0-5 采纳）：数据经 JSON 安全序列化（`\u003c` 防 `</script>` 边界）；popup 等一切注入文本先 HTML 转义；产物带 CSP（仅允许 https/data/blob 来源）；特征数量与字符串长度设上限（校验层）。

## 7. 目录演进预留

- `packages/mcp/`：M2 里程碑，协议见 docs/agent-integration.md。
- `rust/`：M3 里程碑，core 的 Rust 双实现（同一 golden 数据集跑双实现交叉验证）。
- `packages/render/src/providers/`：M4 扩展腾讯/天地图/百度。
