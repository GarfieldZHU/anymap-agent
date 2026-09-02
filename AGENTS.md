# AGENTS.md — 给 LLM Agent 的工作约定

> 本文件服务于 **Codex / 任意 agent** 进入本仓库时的行为约定。WorkBuddy 会话亦遵守。

## 仓库是什么

MapLibre GL JS + 合规底图(高德先行) + GeoJSON 唯一状态，面向 agent 的标准地图渲染层。
**先读 [GOALS.md](GOALS.md)**（最高指导纲领），再读 [docs/](docs/) 对应设计。

## 常用命令

```bash
npm ci                    # 安装（npm workspaces）
npm test                  # core + golden 测试（必跑，改动必过）
npm run lint
npm run build             # 构建所有包 + demo
npm run demo              # 构建 demo 到 dist/demo
npx anymap validate <file.geojson>
npx anymap render <file.geojson> --provider amap -o out.html
```

## 硬性纪律（违反即打回）

1. **合规白名单**：境内底图仅 `amap|tencent|tianditu|baidu`。Google/Mapbox/OSM 直连一律不得写入任何代码/示例/文档（仅架构扩展点，见 docs/provider.md §4）。
2. **无 key 入库**：任何真实 API key 不得进入仓库、产物、示例。需要 key 的地方用占位符 + 文档指引。
3. **坐标体系**：默认 GCJ-02；WGS-84 入站必须经 core 转换；禁止混用坐标系（这是历史错位主因）。
4. **GeoJSON 唯一状态**：新增空间数据一律 FeatureCollection + `sym` 语义属性（见 docs/data-model.md）；禁止散落硬编码坐标点。
5. **改动渲染/投影/转换逻辑**：必须本地 `npm test` 全绿（含 golden）再提交，否则 CI 会拦。
6. **反馈闭环**：任何「画得不对」的反馈，先转化为 golden 用例（tests/golden/）跑到红，再修代码（docs/verification.md §3）。
7. **不要内联可用 key 的高德静态图 URL 当底图**：静态图方案有 label z+1 坑（docs/adr/ADR-002.md），本项目用 MapLibre 矢量渲染。

## 目录速览

- `packages/core` 纯 TS 数学层（crs 转换 / 投影 / ops / schema）
- `packages/render` MapLibre 渲染 + provider 注册表
- `packages/cli` 命令行
- `packages/mcp`（M2）MCP server
- `examples/data/*.geojson` 验收样例；`tests/golden/` 标定数据集

## 提交流程

1. 从 main 拉最新；2. 小步提交（一个逻辑一个 commit）；3. `npm test` + `npm run lint` 全绿；4. push 触发 CI；5. CI 红则回修，不许带红合并。
