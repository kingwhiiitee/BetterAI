// End-to-end check against a running `wrangler dev` with a fresh local DB.
//   BASE=http://127.0.0.1:8787 TOKEN=... node scripts/e2e.mjs
const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const TOKEN = process.env.TOKEN;
let id = 0;
async function rpc(method, params, token = TOKEN, path = '/mcp') {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  return { status: r.status, body: r.status === 202 ? null : await r.json() };
}
async function call(name, args) {
  const { body } = await rpc('tools/call', { name, arguments: args });
  if (body.error) throw new Error(`${name}: ${body.error.message}`);
  const text = body.result.content[0].text;
  if (body.result.isError) return { error: text };
  return JSON.parse(text);
}
function check(cond, msg) {
  if (!cond) { console.error('FAIL', msg); process.exitCode = 1; } else console.log('ok  ', msg);
}

check((await rpc('tools/list', {}, null)).status === 401, 'no token → 401');
check((await rpc('tools/list', {}, 'wrong-token-wrong-token')).status === 401, 'wrong token → 401');
const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
check(init.body.result.serverInfo.name === 'learning-knowledge', 'initialize');
check((await rpc('tools/list', {}, null, '/mcp/' + TOKEN)).status === 200, 'token in path works');
const n = await fetch(BASE + '/mcp', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
check(n.status === 202, 'notification → 202');
const tools = (await rpc('tools/list', {})).body.result.tools;
check(tools.length >= 15, `tools/list returns ${tools.length} tools`);

const { course_id } = await call('upsert_course', { name: '深度学习' });
const { assessment_id } = await call('upsert_assessment', { course_id, name: '期末', exam_date: '2026-12-20' });
const ids = {};
for (const [title, kind] of [['前向传播', 'method'], ['激活函数导数', 'formula'], ['链式法则', 'theorem'], ['误差反传', 'method'], ['矩阵维度', 'concept']])
  ids[title] = (await call('upsert_node', { course_id, title, kind })).node_id;
check(Object.values(ids).every(Boolean), 'nodes created');
check((await call('upsert_node', { course_id, title: '链式法则', kind: 'theorem', definition: 'd(f∘g)=f\'(g)g\'' })).node_id === ids['链式法则'], 'upsert_node updates in place');
await call('link_nodes', { from_id: ids['链式法则'], to_id: ids['误差反传'], relation: 'prerequisite_of' });

const v3 = await call('estimate_value', { node_id: ids['链式法则'], assessment_id, value: 3, uncertainty: 'high', basis: '感觉重要', sources: ['guess'] });
check(!!v3.error, 'value 3 from guess only is rejected');
await call('estimate_value', { node_id: ids['链式法则'], assessment_id, value: 3, uncertainty: 'medium', basis: '大纲重点', sources: ['syllabus'] });

const { session_id } = await call('start_session', { course_id, planned_min: 20, goal: '应考' });
const att = await call('record_attempt', {
  session_id,
  task: { source: 'past_paper', format: 'calculation', prompt: '双层网络参数梯度', steps: [
    { node_id: ids['前向传播'], role: 'supporting' }, { node_id: ids['激活函数导数'], role: 'supporting' },
    { node_id: ids['链式法则'] }, { node_id: ids['误差反传'] }, { node_id: ids['矩阵维度'], role: 'supporting' } ] },
  context: 'delayed', hints: 'none', overall: 'wrong',
  step_results: [
    { step_no: 1, outcome: 'demonstrated' }, { step_no: 2, outcome: 'demonstrated', qualifier: 'guessed' },
    { step_no: 3, outcome: 'failed', difficulties: ['condition', 'recognition'] },
    { step_no: 4, outcome: 'not_reached' }, { step_no: 5, outcome: 'not_reached' } ],
});
check(att.attempt_id && Object.keys(att.evidence_ids_by_step).length === 5, 'record_attempt writes 5 evidence rows');
const bad = await call('record_attempt', { task_id: att.task_id, context: 'delayed', hints: 'none', overall: 'wrong', step_results: [{ step_no: 9, outcome: 'failed' }] });
check(!!bad.error, 'unknown step rejected');

const node = await call('get_node', { node_id: ids['链式法则'] });
check(node.rule_baseline.suggested_level === 'weak', 'rule baseline: failed step → weak');
check(node.evidence[0].difficulties.length === 2, 'difficulties are multi-select');
const act = await call('get_node', { node_id: ids['激活函数导数'] });
check(act.rule_baseline.suggested_level === 'exposed', 'guessed correct is not counted as mastery');
const fwd = await call('get_node', { node_id: ids['前向传播'] });
check(fwd.rule_baseline.suggested_level === 'independent', 'demonstrated without hints → independent');
check((await call('get_node', { node_id: ids['误差反传'] })).rule_baseline.suggested_level === 'exposed', 'not_reached gives no mastery evidence');

check(!!(await call('assess_state', { node_id: ids['链式法则'], level: 'weak', rationale: 'x' })).error, 'state without evidence rejected');
check(!!(await call('assess_state', { node_id: ids['链式法则'], level: 'weak', rationale: 'x', basis: [att.evidence_ids_by_step[1]] })).error, 'evidence from another node rejected');
const st = await call('assess_state', { node_id: ids['链式法则'], level: 'weak', weak_point: '复合函数条件', rationale: '真题第3步错', basis: [att.evidence_ids_by_step[3]] });
check(st.state_id, 'assess_state ok');

const d1 = await call('decide', { node_id: ids['矩阵维度'], assessment_id, action: 'skim', reason: '低价值', condition: '仅限期末前' });
const d2 = await call('decide', { node_id: ids['矩阵维度'], assessment_id, action: 'learn', reason: '后续课程需要' });
check(d1.status === 'active' && d2.replaced === 1, 'new scope decision revokes the previous one');
const d3 = await call('decide', { node_id: ids['链式法则'], assessment_id, action: 'explain', reason: '条件理解错', priority: 1, state_id: st.state_id });
check(d3.status === 'planned', 'one-off decision is planned');
check(!!(await call('update_decision', { decision_id: d3.decision_id, status: 'revoked' })).error, 'revoke needs a reason');
await call('end_session', { session_id, summary: '链式法则条件不清；下次从复合函数求导开始' });

const cand = await call('review_candidates', { course_id, assessment_id });
check(cand[0]?.title === '链式法则', 'review_candidates ranks weak high-value node first');
const ov = await call('overview', {});
check(ov.courses[0].levels.weak === 1 && ov.open_decisions.length === 2 && ov.last_sessions[0].summary, 'overview shows states, decisions, last session');

const api = await fetch(BASE + `/api/courses/${course_id}`, { headers: { authorization: `Bearer ${TOKEN}` } });
const tree = await api.json();
check(api.status === 200 && tree.nodes.length === 5 && tree.edges.length === 1, 'web API course tree');
check((await fetch(BASE + '/api/overview')).status === 401, 'web API needs token');
