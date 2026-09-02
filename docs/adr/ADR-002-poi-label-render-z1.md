# ADR-002 — 高德静态底图 POI label/图标按 z+1 渲染（像素标定偏移根因）

- 状态：**已定案（v7 实测验证）**
- 日期：2026-09-02
- 关联：docs/verification.md §2；docs/provider.md

## 背景

v6 将底图换成 SVG 覆盖层后，POI（老君阁、熊猫塔）的覆盖点与底图 label 仍差 30–50px。曾误判为「center marker 偏移/瓦片拼接问题」，做了字节对比、md5 校验、center marker 实验后定位根因。

## 定案

**高德 staticmap 的瓦片以请求 zoom 渲染底图，但 POI label/图标实际按 z+1 的细节层级绘制。** 即：请求 z=15 的静态图，label 使用 z=16 的渲染语义（位置、字号、去重规则都不同），因此用 z=15 的瓦片投影公式去算 label 位置必然系统性偏移。

### 对策（v7 采用）

- 页面仍按 `proj_zoom = base_zoom + 1` 投影 SVG 节点 → 节点对齐的是 label，而不是底图线条。
- MapLibre 场景（本项目 v0.1）**天然规避此坑**：矢量 label/标记与底图瓦片由同一引擎按同一 zoom 渲染，不存在两个 zoom 语义；该 ADR 记录为「静态图方案专属坑」，供 headless 静态导出（M3）与未来任何 staticmap 集成参考。

## 教训固化

- 用静态图当底图时，凡涉及 POI label 对齐，先确认「瓦片 zoom 与 label zoom」是否为两个值；是则用 z+1 投影或改用矢量渲染引擎。
- 不要用「肉眼差多少」猜测偏移来源；先做 marker 在已知坐标上的标定实验（把 marker 打到一个你确定坐标的点，看偏差方向/大小）。
