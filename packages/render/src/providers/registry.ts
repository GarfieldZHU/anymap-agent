/**
 * registry.ts — provider 注册表（合规白名单运行期强制）。
 * 编译期由 ProviderId 联合类型把关，运行期 get() 对未知/未激活 id 抛错（GOALS G2.2）。
 */
import type { ProviderDef, ProviderId } from '../types.js';
import { amap } from './amap.js';

/** 白名单内、本版本已激活的 provider */
export const ACTIVE_PROVIDERS: Record<string, ProviderDef> = {
  amap,
};

/** 白名单内、未激活（需自备 key / M4 里程碑）：get() 会给出指引而非静默回退 */
export const INACTIVE_PROVIDERS: Record<string, { reason: string }> = {
  tencent: { reason: '腾讯地图 provider 计划于 M4 接入；JS API 级能力需用户自备 key（占位符规范见 docs/provider.md）' },
  tianditu: { reason: '天地图 provider 计划于 M4 接入；需用户自备 tk' },
  baidu: { reason: '百度 provider 计划于 M4 接入；注意 crs=BD-09 需坐标转换' },
};

export const WHITELIST: ProviderId[] = ['amap', 'tencent', 'tianditu', 'baidu'];

export function getProvider(id: string): ProviderDef {
  if (id in ACTIVE_PROVIDERS) return ACTIVE_PROVIDERS[id]!;
  if (id in INACTIVE_PROVIDERS) {
    throw new Error(`provider "${id}" 在白名单但未激活：${INACTIVE_PROVIDERS[id]!.reason}`);
  }
  throw new Error(
    `provider "${id}" 不在合规白名单内（仅允许 amap|tencent|tianditu|baidu）。` +
      'Google/Mapbox 等仅作海外区域例外（docs/provider.md §4），不提供默认接入。',
  );
}

export function listProviders(): ProviderDef[] {
  return Object.values(ACTIVE_PROVIDERS);
}
