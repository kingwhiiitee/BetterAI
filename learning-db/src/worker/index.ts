// learning-knowledge Worker
//   /mcp            MCP (Streamable HTTP, JSON responses) for AI clients
//   /mcp/<token>    same, with the token in the path (for clients that cannot send headers)
//   /api/...        read-only JSON for the web viewer
//   everything else static assets (the web viewer)
// All /mcp and /api requests need ACCESS_TOKEN (Authorization: Bearer <token>, or the path form above).

import { TOOLS, TOOL_MAP, ToolError, overview, courseTree, nodeDetail, type Env } from './tools';

const SERVER_INFO = { name: 'learning-knowledge', version: '0.2.0' };
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS = `个人学习知识库（Evidence-Centered Design 四层：知识节点 / 学习证据 / 知识状态 / 教学决策）。
开课先调 overview 看上次的中断点和待办决策，再用 review_candidates 或 get_node 决定本轮任务；
作答后用 record_attempt 按步骤记录证据（做错只记真正出错的那一步）；
需要时用 assess_state 写状态（必须引用证据 id），用 decide 记录下一步；结束用 end_session 写微型学习记录。
自估把握只在学生说了或被问到时填写，不要编造。`;

const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function authorized(req: Request, env: Env, pathToken: string | null): boolean {
  if (!env.ACCESS_TOKEN || env.ACCESS_TOKEN.length < 16) return false; // refuse to run unprotected
  const header = req.headers.get('authorization') ?? '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
  const token = bearer ?? pathToken;
  return token !== null && timingSafeEqual(token, env.ACCESS_TOKEN);
}

// ---------- MCP ----------

type RpcRequest = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };

async function handleRpc(env: Env, msg: RpcRequest): Promise<unknown | null> {
  const isNotification = msg.id === undefined || msg.id === null;
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });

  if (msg?.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Invalid Request');
  if (isNotification) return null;

  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion ?? '');
      return ok({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: !!t.readOnly, destructiveHint: false },
        })),
      });
    case 'tools/call': {
      const name = String(msg.params?.name ?? '');
      const tool = TOOL_MAP.get(name);
      if (!tool) return fail(-32602, `Unknown tool: ${name}`);
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await tool.run(env, args);
        return ok({ content: [{ type: 'text', text: JSON.stringify(result, null, 1) }], isError: false });
      } catch (e) {
        const message = e instanceof ToolError ? e.message : `internal error: ${(e as Error).message}`;
        return ok({ content: [{ type: 'text', text: message }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

async function handleMcp(req: Request, env: Env): Promise<Response> {
  if (req.method === 'GET') return new Response('SSE stream not supported; POST JSON-RPC instead', { status: 405, headers: { allow: 'POST' } });
  if (req.method === 'DELETE') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as RpcRequest[];
  const replies = (await Promise.all(messages.map((m) => handleRpc(env, m)))).filter((r) => r !== null);
  if (!replies.length) return new Response(null, { status: 202 });
  return json(batch ? replies : replies[0]);
}

// ---------- web API ----------

async function handleApi(url: URL, env: Env): Promise<Response> {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  try {
    if (parts[1] === 'overview' && parts.length === 2) return json(await overview(env, null));
    if (parts[1] === 'courses' && parts.length === 3) return json(await courseTree(env, Number(parts[2])));
    if (parts[1] === 'nodes' && parts.length === 3) return json(await nodeDetail(env, Number(parts[2])));
    return json({ error: 'not found' }, 404);
  } catch (e) {
    if (e instanceof ToolError) return json({ error: e.message }, 404);
    throw e;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === '/mcp' || path.startsWith('/mcp/')) {
      const pathToken = path.startsWith('/mcp/') ? decodeURIComponent(path.slice(5)) : null;
      if (!authorized(req, env, pathToken))
        return json({ error: 'unauthorized' }, 401, { 'www-authenticate': 'Bearer' });
      return handleMcp(req, env);
    }

    if (path.startsWith('/api/')) {
      if (req.method !== 'GET') return json({ error: 'read-only' }, 405);
      if (!authorized(req, env, null)) return json({ error: 'unauthorized' }, 401);
      return handleApi(url, env);
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
