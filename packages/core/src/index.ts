/**
 * @anymap/core — 纯数学层：crs 转换、Web Mercator 投影、GeoJSON schema 与算子。
 * 零运行时依赖；可被 TS/Rust/wasm 交叉验证（GOALS G5 / M3）。
 */
export * from './geo.js';
export * from './crs.js';
export * from './projection.js';
export * from './ops.js';
export * from './schema.js';
