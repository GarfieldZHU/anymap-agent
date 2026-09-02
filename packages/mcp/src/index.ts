/**
 * index.ts — anymap MCP server 入口（stdio transport）。
 *
 * 协议：MCP stdio transport 之上的 JSON-RPC 2.0 —— 每行一个 JSON 消息（newline-delimited）。
 * 零运行时依赖：手写最小协议面（initialize / ping / tools/list / tools/call），
 * 与 @modelcontextprotocol/sdk 客户端（WorkBuddy / Codex / Claude 系）兼容。
 *
 *   initialize      → serverInfo + capabilities.tools
 *   notifications/initialized → 忽略（无状态 server）
 *   ping            → {}
 *   tools/list      → 4 个工具 schema（render_map/validate_geojson/providers/bounds_of_route）
 *   tools/call      → runTool 分发；工具错误用 result.isError（MCP 语义），协议错误用 JSON-RPC error
 *
 * 启动：node packages/mcp/dist/index.js   （由 mcp.json / codex config.toml 的 stdio 配置拉起）
 */
import { createInterface } from 'node:readline';
import { SERVER_INFO, TOOLS, runTool } from './tools.js';

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
};

function send(msg: unknown): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function errorResponse(id: number | string | null, code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function okResponse(id: number | string | null, result: unknown): void {
  send({ jsonrpc: '2.0', id, result });
}

function handle(msg: JsonRpcRequest): void {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize': {
      const protocolVersion =
        typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2024-11-05';
      okResponse(id ?? null, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });
      return;
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return; // 无状态，忽略
    case 'ping':
      okResponse(id ?? null, {});
      return;
    case 'tools/list':
      okResponse(id ?? null, { tools: TOOLS });
      return;
    case 'tools/call': {
      const name = String(params?.name ?? '');
      const args = (params?.arguments as Record<string, unknown>) ?? {};
      try {
        const r = runTool(name, args);
        okResponse(id ?? null, {
          content: [{ type: 'text', text: r.text }],
          ...(r.isError ? { isError: true } : {}),
        });
      } catch (err) {
        okResponse(id ?? null, {
          content: [{ type: 'text', text: `工具执行异常: ${(err as Error).message}` }],
          isError: true,
        });
      }
      return;
    }
    default:
      if (id !== undefined && id !== null) {
        errorResponse(id, -32601, `Method not found: ${method}`);
      }
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg: JsonRpcRequest;
  try {
    msg = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
    // 非 JSON 行：忽略（协议外噪声）
    return;
  }
  if (msg && typeof msg === 'object' && msg.method) handle(msg);
});

rl.on('close', () => {
  process.exit(0);
});

// stdout 由协议独占；诊断一律走 stderr
process.stderr.write(`[anymap-mcp] ${SERVER_INFO.name} v${SERVER_INFO.version} ready (stdio)\n`);
