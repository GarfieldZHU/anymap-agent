# Verification — golden 像素标定与交叉验证机制

> 依据 GOALS G5。目标：把「画得对不对」从**肉眼判断**变成**断言判断**；任何主观反馈都先沉淀为用例再修。

## 1. 三层验证模型

```
L1 单元断言（CI 必跑）    core 数学层：转换/投影/抽稀/bounds 全纯函数断言
L2 标定断言（CI 必跑）    golden 数据集：已知地标(经纬度,期望像素/期望层级) 反查与正投影互逆
L3 渲染冒烟（CI 轻量）    demo 构建成功 + HTML 指纹存在；交互正确性靠 L1/L2 + 人工抽查
L4 浏览器 conformance（M2 引入）固定浏览器/MapLibre/viewport/DPR + 冻结瓦片 fixture，
                          断言图层/要素像素锚点/显隐/透明度/popup（P0-2 采纳）
```

WebGL 无法在 CI 无头环境跑，因此**像素级正确性的断言全部下沉到 core 数学层**，渲染层保持薄（只做引擎调用），把「会画错」的概率压到最低层并锁死。**core 数学 golden 不代替浏览器渲染验证**——浏览器级 conformance（L4）随 M2 引入 playwright 固定环境；在此之前，对外承诺的“渲染一致性”限于 L1–L3 + 人工抽查，不宣称像素级保证（GOALS 成功判据已同步措辞）。

## 2. Golden 数据集（tests/golden/，入库）

来源：v1–v7 成都三景点人工标定的真实地标（来自高德底图可辨识 label）。

```ts
// tests/golden/landmarks.ts（示意）
export const LANDMARKS = [
  // { name, crs:'GCJ-02', lon, lat, zoom, expectedWorldXY, source:'amap-web-v7-标定' }
  { name: '老君阁(青城山)',  lon: 103.5675,  lat: 30.9022,  zoom: 15, note: 'v7 页面人工标定，瓦片 label 中心' },
  { name: '熊猫塔(基地)',    lon: 104.1463,  lat: 30.7367,  zoom: 16, note: '…' },
  // …
];
```

### 2.1 断言形式

1. **投影一致性**：`lonLatToWorldXY(landmark)` 的 (x,y) 与参考实现的差 < 1e-6（纯数学，锁定公式）。
2. **scale 语义**：`ll2px(…, scale=2)` == `ll2px(…, scale=1)` 坐标 ×2（锁死 ADR-001，防「小一圈」回归）。
3. **互逆性**：`gcj02ToWgs84(wgs84ToGcj02(p))` ≈ p（1e-6 内）。
4. **crs 一致性**：任意 golden 点经转换后投影，跨实现（TS vs 未来 Rust）一致。
5. **静态图布局回归（M3 后）**：headless 出图后，对图内已知 label 像素做模板匹配/位置断言。

## 3. 反馈 → 用例闭环（强制流程）

「图上某某点和实际不对」这类反馈，处理顺序：

1. 复现：记录页面指纹（provider/zoom/bbox/schemaVer）。
2. 判定：是数据(crs/坐标)错、投影错、还是渲染配置错。
3. **先加一条 golden 用例**（该地标 + 期望），跑到红。
4. 修代码 → 用例转绿 → 全量回归 → 提交。

## 4. 双实现交叉验证（GOALS G5 / M3）

core 的同一份 golden 数据被 **TS 实现**与 **Rust 实现**分别消费，输出对齐（1e-6 级）才算通过——以此保证「投影数学」不随语言漂移。v0.1 先建好 TS 侧数据集与 runner，Rust 侧接入点预留 `tests/golden/fixtures.json`（实现无关的纯数据文件）。

## 5. CI 流水线（.github/workflows/ci.yml）

```yaml
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - checkout, setup-node 22, npm ci
      - npm run lint
      - npm test            # L1 + L2 golden
      - npm run build       # 全部包 + demo
      - npm run smoke       # 检查 dist demo index.html 存在且含指纹标记
  pages:                    # main 分支构建后部署 demo 到 Pages
    needs: verify
    permissions: { pages: write, id-token: write }
    steps: deploy-pages(upload dist/demo)
```

Pages URL：`https://garfieldzhu.github.io/anymap-agent/`（demo 入口）。

## 6. 本地验证命令

```bash
npm test                # vitest run（core 全量 + golden）
npm run test:watch
npm run demo            # 构建 demo 到 dist/demo
npx anymap validate examples/data/*.geojson
```
