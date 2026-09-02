# Agent Integration — 与 LLM Agent 的标准化集成协议

> 依据 GOALS G4。目标：**WorkBuddy 与 Codex 用同一套协议、各 ≤5 分钟接入**；协议开放，任意 agent 可复用。

## 1. 统一调用面（四种，语义等价）

| 面 | 载体 | 适合 | 状态 |
|---|---|---|---|
| **CLI** | `anymap render|validate|providers` | 任何 agent 的 shell 调用 | v0.1 |
| **文件协议** | GeoJSON 入、自包含 HTML 出 | 直接交付/落盘 | v0.1 |
| **HTTP API** | `POST /render`（预留） | 服务化/多 agent 共享 | M2+ |
| **MCP** | stdio server，tools：`render_map / validate_geojson / providers / bounds_of_route` | WorkBuddy/Codex 原生 tool 调用 | M2 |

CLI 契约（v0.1）：

```bash
# 渲染：GeoJSON 文件 或 内联 JSON
anymap render ./route.geojson --provider amap --fit -o out.html
anymap render '{"type":"FeatureCollection",…}' --provider amap -o out.html

# 校验（先跑，错误早暴露）
anymap validate ./route.geojson

# 列出白名单 provider
anymap providers
```

退出码：0=成功；1=数据/参数错误（stderr 给出 schema 定位）；2=渲染错误。

## 2. WorkBuddy 接入（方式一：MCP；方式二：CLI+Skill）

### 方式一：MCP server（M2 实装，配置即刻生效）

在 `~/.workbuddy/mcp.json` 的 `mcpServers` 增加：

```jsonc
{
  "mcpServers": {
    "anymap-agent": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/alohayo/Home/Code/anymap-agent/packages/mcp/dist/index.mjs"],
      "env": { "ANYMAP_HOME": "/Users/alohayo/Home/Code/anymap-agent" }
    }
  }
}
```

启用后：WorkBuddy 连接器管理右上角「自定义连接」→ 对 anymap-agent 点 **Trust**。之后 agent 可直接说「把这条 GeoJSON 渲染成高德底图的地图页」→ 调用 `render_map` 工具。

### 方式二：Skill（不依赖 MCP 也能用）

项目提供 `skills/anymap-render/SKILL.md`，把 CLI 调用步骤固化为可复用技能（含合规检查清单）。安装到 `~/.workbuddy/skills/` 后，对话中自然触发。

## 3. Codex 接入

### 3.1 项目内约定（repo 自带 AGENTS.md）

`AGENTS.md` 写清：安装 `npm ci`、命令示例、**改动渲染逻辑必须跑 `npm test`（golden 全绿）**、provider 白名单纪律、key 纪律。Codex 进入项目即读到。

### 3.2 信任项目 + 调用

```bash
# Codex 配置（~/.codex/config.toml）
[project_trust]
"/Users/alohayo/Home/Code/anymap-agent" = "trusted"

# 派发渲染任务
codex exec --skip-git-repo-check \
  "把 examples/data/qingchengshan.route.geojson 渲染为高德底图交互页并保存到 examples/out/"
```

### 3.3 Codex 读 MCP（可选）

Codex CLI 支持 MCP server 配置（config.toml `[mcp_servers]`），复用 §2 同一 server 即可，保证两端行为一致。

## 4. 交叉验证职责划分（GOALS G5 落点）

- **WorkBuddy（本会话）**：负责纲领/架构/实现的推进与合并。
- **Codex（subagent）**：以独立视角审查设计与实现，产物 = 审查意见 issue 级 markdown（`docs/reviews/`）；对 core 数学实现跑同一 golden 断言（双实现交叉验证）。
- **验收门槛**：任何一方修改投影/转换/渲染布局，必须本地 `npm test` 全绿再提交；CI 再兜底。

## 5. 开放性与扩展

- 任意第三方 agent 接入路径：装依赖 → 用 CLI（或起 MCP）→ 收 GeoJSON 文件即用，无需了解内部实现。
- schema 全链路 JSON Schema 化（`anymap.schema.json`），生成即文档，避免协议漂移。
- 协议版本：CLI `--version` 与 MCP `initialize` 均上报协议版本，向前兼容策略为「主版本内新增字段只增不删」。

## 6. 接入自检清单（提交前）

- [ ] `npm ci && npm test` 全绿
- [ ] `npx anymap validate <样例>` 通过
- [ ] 渲染页打开无控制台错误，指纹 footer 可见
- [ ] 无 key 入库 / 无白名单外 provider URL
