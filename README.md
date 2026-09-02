# anymap-agent 🗺️🐙

**给 LLM Agent 一双能「看懂」且能「画对」地图的手。**

MapLibre GL JS + 合规底图（高德先行）+ GeoJSON 唯一状态，面向 WorkBuddy / Codex / 任意 agent 的标准地图理解与渲染层。

> ⚠️ **先读 [GOALS.md](GOALS.md)** —— 它是本仓库的最高指导纲领，所有设计、实现、验收以纲领条款为裁决依据。

![CI](https://github.com/GarfieldZHU/anymap-agent/actions/workflows/ci.yml/badge.svg)
🌐 Demo: **https://garfieldzhu.github.io/anymap-agent/** （青城山前山 / 熊猫基地 / 三星堆，高德底图）

## 一句话架构

```
┌─────────────┐  GeoJSON(唯一状态)  ┌──────────────────────────────┐
│  Agent      │ ──────────────────▶ │  anymap-agent                │
│ WorkBuddy   │   CLI / MCP / HTTP  │  ├ @anymap/core  坐标·投影·转换│
│ Codex/其他  │ ◀────────────────── │  ├ @anymap/render MapLibre渲染│
└─────────────┘  可移植地图页/静态图  │  └ provider 注册表(合规白名单)│
                                    └──────────────────────────────┘
                                               │
                              MapLibre GL JS（渲染内核，开源免 key）
                                               │
                          ┌───────────┬────────┴────┬───────────┐
                       高德(✅v0.1)   腾讯(预留)   天地图(预留)   百度(预留)
                       GCJ-02 栅格   合规白名单内 provider 可插拔
```

- 底图 provider **白名单**（境内合规）：高德 / 腾讯 / 百度 / 天地图。Google/Mapbox 仅架构扩展点（海外例外），不默认启用。
- 坐标：anymap GeoJSON profile —— **crs 显式声明，缺省 GCJ-02（非 WGS-84，勿当纯 RFC 7946 解读）**；WGS-84 入站自动转换；ll2px 投影固化并配 golden 像素测试（v1–v7 血泪教训 → ADR-001/002）。
- 独立审查闭环：设计经本机 Codex 独立审查（`docs/reviews/`），P0 修订已闭环。

## 快速开始（v0.1，CI 已验证）

```bash
npm ci && npm run build          # 构建 core/render/cli 三包

# 校验数据（schema + sym + crs）
node packages/cli/dist/index.js validate examples/data/qcs.routes.geojson

# 渲染为可移植地图页（MapLibre CDN + 高德瓦片，需联网打开）
node packages/cli/dist/index.js render examples/data/qcs.routes.geojson --provider amap -o out.html
# 浏览器打开 out.html：路线/POI 与高德底图对齐，可点击查 GCJ/WGS 坐标、显隐/透明度/复位
```

## 文档索引

| 文档 | 内容 |
|---|---|
| [GOALS.md](GOALS.md) | **目标纲领**（最高指导） |
| [AGENTS.md](AGENTS.md) | 给 codex/任意 agent 的接入约定 |
| [docs/architecture.md](docs/architecture.md) | 总体架构与模块设计 |
| [docs/data-model.md](docs/data-model.md) | ananyap GeoJSON profile、坐标系、投影约定 |
| [docs/provider.md](docs/provider.md) | 底图 provider 抽象与合规白名单 |
| [docs/agent-integration.md](docs/agent-integration.md) | WorkBuddy / Codex / MCP / CLI 集成协议 |
| [docs/verification.md](docs/verification.md) | golden 像素标定与交叉验证机制（L1–L4） |
| [docs/adr/](docs/adr/) | 架构决策记录（ADR-001 scale / ADR-002 label z+1 / ADR-003 MapLibre） |
| [docs/reviews/](docs/reviews/) | 独立审查报告（交叉验证产出） |

## 里程碑状态

- ✅ **M1** repo + 纲领 + 设计文档 + v0.1 core/render/cli + examples + golden 测试 + CI（全绿）+ Pages
- ⏳ **M2** MCP server 实装 + WorkBuddy `~/.workbuddy/mcp.json` / Codex 实测接入（≤5 分钟配置）
- ⏳ **M3** Rust 交叉实现（同一 golden 跑双实现）+ 浏览器级 conformance（L4）
- ⏳ **M4** 腾讯/天地图/百度 provider + 海外例外文档

## 本地开发注意（外置盘已知问题）

- 本仓库位于外置盘（`/Volumes/...`），npm workspaces 的 **bin 链接可能失败**（`rename node_modules/.bin/...` 报错）：
  - 对策：安装依赖用 `npm install --no-bin-links`（发布包时才需要 bin 字段，仓库内已移除 `@anymap/cli` 的 bin）；
  - 若 `node_modules/.vite-temp` 残留触发清理，先 `mv node_modules/.vite-temp /tmp/` 再 install。
- 本地无需跑完整构建也能用 CI 验证：push 后 GitHub Actions 跑 typecheck/test/build/demo/smoke。
