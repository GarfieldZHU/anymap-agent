# ADR-001 — Web Mercator 像素投影的 scale/DPR 语义

- 状态：**已定案（v5 实测验证）**
- 日期：2026-09-02
- 关联：GOALS G3；docs/data-model.md §3

## 背景

成都行攻略渲染（v1–v5）反复出现「绘制线路比实际小一圈」：坐标点/线相对底图系统性收缩约一半。排查发现公式形如

```python
px = (px-cx) + w/2          # 缺少 ×scale
py = (py-cy) + h/2
```

或另一处写成 `(px-cx) + w*scale/2` 但 worldXY 未乘 scale——半吊子乘法的结果就是绘制范围只有底图的一半。

## 定案

高德静态图 API 的 `scale` 参数是 **DPR（devicePixelRatio）语义**：`scale=2` 表示输出图物理像素是 CSS 像素的 2 倍。因此：

```ts
function ll2px(lon, lat, cLon, cLat, zoom, w, h, scale = 1) {
  const c = lonLatToWorldXY(cLon, cLat, zoom);
  const p = lonLatToWorldXY(lon, lat, zoom);
  return { px: (p.x - c.x) * scale + (w * scale) / 2,
           py: (p.y - c.y) * scale + (h * scale) / 2 };
}
```

**乘法作用在偏移量上**（连同视口半宽一起乘 scale），而不是只乘结果坐标、更不是只乘 worldXY 的某一半。

## 教训固化

- core 库的 `ll2px` 即上公式（scale 默认 1 = CSS 像素），golden 断言 2.1.2 锁死 scale 语义。
- 任何「看起来整体偏小/偏大 k 倍」的问题，优先怀疑 scale 乘错位置，而不是 zoom 配错。
