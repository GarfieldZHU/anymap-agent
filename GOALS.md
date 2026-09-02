# GOALS.md — anymap-agent 目标纲领

> **本文件是 anymap-agent 的最高指导纲领。** 所有设计决策、代码实现、验收标准都以此为准。
> 纲领变更必须经过评审与提交记录；实现细节的争论以纲领条款为裁决依据。

---

## 0. 项目定位（一句话）

**给 LLM Agent 一双能「看懂」且能「画对」地图的手**：一个以 MapLibre GL JS 为渲染内核、底图提供方可插拔、空间数据以 GeoJSON 为唯一状态、且能被任意 agent（WorkBuddy / Codex / 其他）以统一方式调用的**标准地图理解与渲染层**。

### 0.1 它解决什么

Agent 处理地图任务长期有两类「回路」，本项目的全部设计都围绕这两条回路展开：

| 回路 | 代表任务 | 本质 | 可靠性 | 本项目对策 |
|---|---|---|---|---|
| **数据回路** | 「帮我找附近的游泳馆/加油站」 | 地理编码 → 检索 API → JSON 坐标 | 高（数据说了算） | 标准化的 GeoJSON 输出 + provider 数据源抽象 |
| **像素回路** | 「按这个顺序画游览路线」「把这条线叠到地图上」 | 坐标 → Web Mercator 投影 → 像素 → 与底图视觉对齐 | 低（v1–v7 反复偏差的根源） | 精确投影公式 + 像素标定 golden 测试 + 交互式自校图层 |

**纲领断言**：像素回路的痛不是「投影公式不存在」，而是**坐标、投影、标定三者从未被结构化固定下来**，每次都由 agent 现场猜。本项目把三者固化为库 + 测试 + 协议。

---

## G1. 渲染内核：MapLibre GL JS

- **选型理由（硬性）**：开源（BSD/ISC）、免 key、纯前端可离线、矢量与栅格源都支持、与 provider 无关、无商业授权风险。
- 不使用各家的私有 GL SDK 作为内核（高德 JS API / 腾讯 GL JS 仅作为**备选渲染后端**的架构预留，不在 v0.1 实现）；不用 Leaflet 叠加方案作为主架构（矢量/样式能力与标定测试基础设施弱于 MapLibre）。
- 交互能力必须内置：图层显隐切换、缩放/平移、点击要素查询（popup）、图层透明度——**禁止让用户手动救场对齐**（见 ADR：v6/v7 教训）。

## G2. 底图提供方抽象（provider-agnostic，高德先行）

### G2.1 合规红线（来自 WorkBuddy geo-map-compliance-guard，强制）

1. **中国境内地图数据源仅允许：高德(AMap)、腾讯(Tencent)、百度(Baidu)、天地图(Tianditu/NASG)**。
2. **禁止**：Google Maps / Apple Maps / Bing 海外版 / OSM 直连海外瓦片 / Mapbox 瓦片 / 任何无资质第三方源，用于中国境内底图。
3. Google / Mapbox 等**仅保留为架构级扩展点**（海外区域渲染属「非默认场景」，需用户自备 key + 明确声明），**默认不启用、示例代码一律不出现其可用 key 或可用瓦片 URL**。
4. **任何有效地图 API key 不得入库、不得内嵌进产物代码**。v0.1 高德底图使用**无需 key 的公开栅格瓦片端点**（与 amap.com 同源审图数据）；若未来需要 JS API 级能力，key 一律以占位符 + 文档说明形式出现（`请在高德开放平台申请自己的 key 后替换`）。
5. 坐标一律 GCJ-02（国内 provider 原生坐标系），杜绝「底图 GCJ-02、数据 WGS-84」的错位（这是 v5 系列偏差的另一半根源）。

### G2.2 Provider 接口（v0.1 定义，随实现收敛）

```ts
interface BasemapProvider {
  id: 'amap' | 'tencent' | 'tianditu' | 'baidu';   // 白名单内
  // 栅格 XYZ 瓦片模板（合规源），MapLibre RasterTileSource 可直接消费
  rasterTiles(opts): TileTemplate;
  // 坐标体系
  crs: 'GCJ-02' | 'WGS-84' | 'BD-09';
  // 合规声明（审图号等元信息，渲染时展示）
  attribution: string;
}
```

Provider 注册表集中管理；**未在白名单的 provider 一律无法通过类型检查/运行时校验注册**（把合规做进类型系统与运行时双保险）。

### G2.3 v0.1 范围

- 实现并验证：**高德栅格底图**（用户指定优先；瓦片端点公开、免 key、与 amap.com 同源）。
- 预留模板但**不实现**：腾讯/天地图/百度（同一接口，换瓦片模板即可）。
- 文档给出海外例外（Google/Mapbox）的架构插入位置与合规前提。

## G3. 空间数据状态：GeoJSON 唯一状态 + 坐标/投影固化

1. **一切空间数据的唯一真相 = GeoJSON**（FeatureCollection）。Agent 的「画什么」永远表达为 GeoJSON，禁止散落硬编码坐标点。
2. **坐标系**：库内统一以 `crs` 显式声明；默认输入/输出 GCJ-02（与高德底图一致）；提供 `wgs84ToGcj02` / `gcj02ToWgs84`（含 BD-09 预留），输入 WGS-84 自动转换并告警记录。
3. **投影固化**：Web Mercator `lonLatToWorldXY(zoom)` + `worldXYToPixel`（scale/DPR 语义明确，见 ADR v5）；封装为 `@anymap/core` 纯函数，逐条配 golden 断言。
4. **样式即数据**：GeoJSON 属性中携带渲染意图（`sym` 类型：marker/route/area/label；颜色；顺序），渲染器按 schema 解释，**不允许 agent 直接操纵像素**。
5. GeoJSON Schema 版本化（`anymap.schema.json`），MCP/CLI 入参校验用同一 schema。

## G4. Agent 集成：标准化、开放、三端一致

### G4.1 统一调用面（v0.1 先落地 CLI + 静态页协议，MCP 紧随）

```
输入（三选一，语义等价）:
  A. GeoJSON 文件路径            anymap render route.geojson --provider amap -o out.html
  B. JSON 任务描述               anymap render '{"type":"FeatureCollection",...}' --fit
  C. 自然语言任务（MCP 层）       render_map("把青城山前山这条路线画出来，标注老君阁")
输出:
  - 自包含交互地图页（HTML，MapLibre + provider 底图 + GeoJSON 矢量层，可单独打开/分享/嵌入）
  - （可选）静态图导出 PNG（headless，标定模式）
```

### G4.2 WorkBuddy 接入标准（验收：≤5 分钟配置）

- 方式一（推荐）：项目内 `mcp/` 提供标准 MCP server（stdio，node），WorkBuddy 的 `~/.workbuddy/mcp.json` 加一段注册即可被识别调用。
- 方式二：把本 repo 暴露的 CLI 封装为 WorkBuddy Skill（`SKILL.md` 内写清调用步骤）。
- 配置样例必须随 repo 提供（`docs/agent-integration.md`），且**同一段配置 Codex 可直接复用**。

### G4.3 Codex 接入标准（验收：≤5 分钟配置）

- repo 根 `AGENTS.md`：写清给 agent 的调用约定（怎么装依赖、怎么渲染、怎么验证）。
- 文档给出：`codex` 信任本项目（trust_project）、`codex exec` 调用 CLI/MCP 的示例。
- **交叉验证机制（G5）对 Codex 同样生效**：Codex 改渲染逻辑必须过同一套 golden 测试。

### G4.4 开放性

- 协议层不绑定任何一家 agent 框架：HTTP API（预留）、CLI、GeoJSON 文件、MCP 四种面，任意 agent 取其一即可接入。
- 全链路（含 MCP schema、CLI schema、GeoJSON schema）用 JSON Schema 描述，生成即文档。

## G5. 可验证性：交叉验证机制（硬性验收，非可选）

1. **Golden 像素标定测试**：将 v1–v7 沉淀的「已知坐标 → 期望像素」对固化为数据集（`tests/golden/`），vitest 断言投影/转换/渲染布局，**防回归**。任何渲染逻辑变更必须全绿。
2. **双向标定**：标定点来自真实地图可辨识地标（老君阁、熊猫塔等），并记录其瓦片 label 像素坐标来源，交叉验证「数据→像素」与「像素→数据」互逆（容差内）。
3. **CI 强制**：GitHub Actions `lint + test + build + demo 冒烟`，未过不得合入 main。
4. **产物自描述**：渲染页携带「版本指纹」（provider/zoom/schema 版本），复现问题只需报指纹。
5. 任何「视觉上感觉不对」的反馈，一律先转化为 golden 用例再修（把主观反馈沉淀为客观断言）。

## G6. 交付形态与示例

- `examples/` 复刻真实验收场景（v1–v7 成都三景点：青城山前山/熊猫基地/三星堆，GeoJSON 化），一键生成可交互地图页，作为「画对没画对」的活标本。
- 数据回路示例：附近游泳馆/加油站检索 → GeoJSON → 渲染（展示检索结果如何标准化落图）。
- Demo 部署 GitHub Pages（`gh-pages` 或 `docs/`），链接可直开。

## 非目标（v0.1 明确不做）

- 实时导航 / 路径规划引擎（数据回路只消费上游 API 结果）
- 离线瓦片库/瓦片自托管
- 3D 场景、建筑白模
- 商业化 SaaS、鉴权计费
- 中国境外的合规底图默认接入（仅文档化扩展点）

## 里程碑

| 里程碑 | 内容 | 判据 |
|---|---|---|
| **M1（本迭代）** | repo + 纲领 + 设计文档 + v0.1 core/render/example + CI + golden 测试 | Pages demo 可开、`npm test` 全绿、双端接入文档可用 |
| **M2** | MCP server 实装 + WorkBuddy mcp.json / Codex 实测接入 | 两端各 ≤5 分钟配置即用 |
| **M3** | Rust 侧（按需）：投影/坐标转换库 + 可选 wasm 或瓦片代理 | 与 TS core 交叉验证（同一 golden 跑双实现） |
| **M4** | 腾讯/天地图 provider + 海外例外文档 + 数据回路检索示例 | 白名单 provider ≥3 可切换 |

## 成功判据（一句话验收）

> 给任意 agent 一份 GeoJSON + 一句话任务，它能 30 秒内产出与真实底图**像素级重合**的可交互地图页；给任何「画错了」的反馈，都能在 10 分钟内转化为一条防回归的 golden 测试。
