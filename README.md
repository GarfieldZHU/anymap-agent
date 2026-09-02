# anymap-agent 🗺️🐙

**给 LLM Agent 一双能「看懂」且能「画对」地图的手。**

MapLibre GL JS + 合规底图（高德先行）+ GeoJSON 唯一状态，面向 WorkBuddy / Codex / 任意 agent 的标准地图理解与渲染层。

> ⚠️ **先读 [GOALS.md](GOALS.md)** —— 它是本仓库的最高指导纲领，所有设计、实现、验收以纲领条款为裁决依据。

## 一句话架构

```
┌─────────────┐  GeoJSON(唯一状态)  ┌──────────────────────────────┐
│  Agent      │ ──────────────────▶ │  anymap-agent                │
│ WorkBuddy   │   CLI / MCP / HTTP  │  ├ @anymap/core  坐标·投影·转换│
│ Codex/其他  │ ◀────────────────── │  ├ @anymap/render MapLibre渲染│
└─────────────┘  交互地图页/静态图   │  └ provider 注册表(合规白名单)│
                                    └──────────────────────────────┘
                                               │
                              MapLibre GL JS（渲染内核，开源免 key）
                                               │
                          ┌───────────┬────────┴────┬───────────┐
                       高德(先行)    腾讯(预留)   天地图(预留)   百度(预留)
                       GCJ-02 栅格   合规白名单内 provider 可插拔
```

- 底图 provider **白名单**（境内合规）：高德 / 腾讯 / 百度 / 天地图。Google/Mapbox 仅架构扩展点，不默认启用。
- 数据源坐标一律 GCJ-02；WGS-84 自动转换；投影 ll2px 固化并配 golden 像素测试（v1–v7 血泪教训）。

## 快速开始（v0.1 后）

```bash
npm install
npx anymap render examples/qingchengshan.route.geojson --provider amap -o out.html
# 浏览器打开 out.html：可交互地图，路线/POI 与高德底图像素级重合
```

## 文档索引

| 文档 | 内容 |
|---|---|
| [GOALS.md](GOALS.md) | **目标纲领**（最高指导） |
| [docs/architecture.md](docs/architecture.md) | 总体架构与模块设计 |
| [docs/data-model.md](docs/data-model.md) | GeoJSON 状态、坐标系、投影约定 |
| [docs/provider.md](docs/provider.md) | 底图 provider 抽象与合规白名单 |
| [docs/agent-integration.md](docs/agent-integration.md) | WorkBuddy / Codex / MCP / CLI 集成协议 |
| [docs/verification.md](docs/verification.md) | golden 像素标定与交叉验证机制 |
| [docs/adr/](docs/adr/) | 架构决策记录（含 v1–v7 踩坑） |

## 里程碑

M1 repo+纲领+设计+v0.1 实现+CI ｜ M2 MCP 实装+双端实测 ｜ M3 Rust 交叉实现 ｜ M4 多 provider
