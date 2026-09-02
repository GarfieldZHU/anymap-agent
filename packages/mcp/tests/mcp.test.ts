/**
 * mcp.test.ts — MCP server 协议级测试（真实 spawn dist 产物 + stdio JSON-RPC）。
 * 覆盖：initialize / tools/list / 4 工具 call / 非法 provider fail-closed / 未知方法 error。
 * 注意：需先 build（CI 顺序 typecheck→test 已保证；本地请先 npm run build）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_BIN = join(HERE, '..', 'dist', 'index.js');
const REPO_ROOT = join(HERE, '..', '..', '..');

const MINIMAL_FC = JSON.stringify({
  type: 'FeatureCollection',
  properties: { anymap: { crs: 'GCJ-02', schemaVer: '0.1.0' } },
  features: [
    {
      type: 'Feature',
      properties: { sym: 'poi', name: '测试点' },
      geometry: { type: 'Point', coordinates: [103.57, 30.9] },
    },
  ],
});

class McpClient {
  private proc: ChildProcessWithoutNullStreams;
  private pending = new Map<number, (m: { result?: unknown; error?: { code: number; message: string } }) => void>();
  private nextId = 1;

  constructor(bin: string) {
    this.proc = spawn('node', [bin], { stdio: ['pipe', 'pipe', 'pipe'] });
    const rl = createInterface({ input: this.proc.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => {
      const m = JSON.parse(line) as { id?: number; result?: unknown; error?: { code: number; message: string } };
      if (m.id !== undefined && this.pending.has(m.id)) {
        this.pending.get(m.id)!(m);
        this.pending.delete(m.id);
      }
    });
  }

  request(method: string, params?: unknown): Promise<{ result?: unknown; error?: { code: number; message: string } }> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, resolve);
      this.proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`请求超时: ${method} (id=${id})`));
        }
      }, 8000);
    });
  }

  close(): void {
    try {
      this.proc.kill();
    } catch {
      /* ignore */
    }
  }
}

let client: McpClient;

beforeAll(() => {
  client = new McpClient(SERVER_BIN);
});

afterAll(() => {
  client.close();
});

function textOf(resp: { result?: unknown }): string {
  const content = (resp.result as { content?: Array<{ type: string; text?: string }> })?.content ?? [];
  return content.map((c) => c.text ?? '').join('');
}

describe('anymap MCP server (stdio)', () => {
  it('initialize 返回 serverInfo + tools capability', async () => {
    const resp = await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'vitest', version: '0.0.0' },
    });
    const r = resp.result as { protocolVersion: string; capabilities: { tools: unknown }; serverInfo: { name: string; version: string } };
    expect(r.serverInfo.name).toBe('anymap-agent-mcp');
    expect(r.capabilities.tools).toBeTruthy();
    expect(r.protocolVersion).toBe('2024-11-05');
  });

  it('tools/list 暴露 4 个契约工具', async () => {
    const resp = await client.request('tools/list');
    const tools = (resp.result as { tools: Array<{ name: string }> }).tools;
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['bounds_of_route', 'providers', 'render_map', 'validate_geojson']);
  });

  it('providers 列出 amap（激活）并提示未激活项', async () => {
    const resp = await client.request('tools/call', { name: 'providers', arguments: {} });
    const text = textOf(resp);
    expect(text).toContain('amap');
    expect(text).toContain('tencent');
    expect((resp.result as { isError?: boolean }).isError).toBeFalsy();
  });

  it('validate_geojson 通过合法 GCJ-02 数据', async () => {
    const resp = await client.request('tools/call', { name: 'validate_geojson', arguments: { geojson: MINIMAL_FC } });
    const text = textOf(resp);
    expect(text).toContain('✓ 校验通过');
    expect(text).toContain('1 个要素');
  });

  it('validate_geojson 对缺省 crs 给 warning（不冒充纯 RFC）', async () => {
    const noCrs = JSON.stringify({
      type: 'FeatureCollection',
      properties: {},
      features: [
        { type: 'Feature', properties: { sym: 'poi' }, geometry: { type: 'Point', coordinates: [103.57, 30.9] } },
      ],
    });
    const resp = await client.request('tools/call', { name: 'validate_geojson', arguments: { geojson: noCrs } });
    const text = textOf(resp);
    expect(text).toContain('警告');
    expect((resp.result as { isError?: boolean }).isError).toBeFalsy();
  });

  it('bounds_of_route 返回 bbox/center/要素数 JSON', async () => {
    const resp = await client.request('tools/call', { name: 'bounds_of_route', arguments: { geojson: MINIMAL_FC } });
    const parsed = JSON.parse(textOf(resp)) as { ok: boolean; features: number; bbox: number[]; center: number[] };
    expect(parsed.ok).toBe(true);
    expect(parsed.features).toBe(1);
    expect(parsed.center[0]).toBeCloseTo(103.57, 5);
  });

  it('render_map 用 examples 数据产出 HTML 文件并返回指纹', async () => {
    const src = join(REPO_ROOT, 'examples/data/pois-qcs.geojson');
    const out = join(tmpdir(), `anymap-mcp-test-${Date.now()}.html`);
    const resp = await client.request('tools/call', {
      name: 'render_map',
      arguments: { geojson: src, provider: 'amap', out, title: 'MCP 测试渲染' },
    });
    const text = textOf(resp);
    expect(existsSync(out)).toBe(true);
    expect(text).toContain('已渲染');
    expect(text).toContain('provider=amap');
  });

  it('render_map 对白名单外 provider fail-closed', async () => {
    const resp = await client.request('tools/call', {
      name: 'render_map',
      arguments: { geojson: MINIMAL_FC, provider: 'google' },
    });
    expect((resp.result as { isError?: boolean }).isError).toBe(true);
    expect(textOf(resp)).toContain('合规白名单');
  });

  it('未知方法返回 JSON-RPC error -32601', async () => {
    const resp = await client.request('nonsense/method', {});
    expect(resp.error?.code).toBe(-32601);
  });
});
