// Fixed tool surface over the learning-knowledge D1 database.
// The AI never writes SQL; every read and write goes through one of these.

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ACCESS_TOKEN: string;
}

export class ToolError extends Error {}

type Json = Record<string, unknown>;
type Schema = Json;

interface Tool {
  name: string;
  description: string;
  inputSchema: Schema;
  readOnly?: boolean;
  run: (env: Env, args: Json) => Promise<unknown>;
}

// ---------- enums (must match schema.sql) ----------

const KINDS = ['concept', 'definition', 'theorem', 'formula', 'method', 'problem_type'];
const RELATIONS = ['prerequisite_of', 'part_of', 'confused_with', 'contrasts_with'];
const TASK_SOURCES = ['past_paper', 'textbook', 'homework', 'teacher_sample', 'ai_generated'];
const FORMATS = ['choice', 'fill', 'calculation', 'proof', 'short_answer', 'other'];
const CONTEXTS = ['right_after_teaching', 'delayed', 'mixed', 'timed', 'unseen_variant'];
const HINTS = ['none', 'partial', 'full'];
const OVERALL = ['correct', 'partial', 'wrong'];
const SELF_SIGNALS = ['sure', 'unsure', 'guessed'];
const OUTCOMES = ['demonstrated', 'failed', 'not_reached', 'unclear'];
const QUALIFIERS = ['guessed', 'slip', 'lucky_path'];
const DIFFICULTIES = ['unknown_concept', 'condition', 'recognition', 'execution', 'transfer', 'forgetting'];
const LEVELS = ['unknown', 'exposed', 'assisted', 'independent', 'validated', 'weak', 'recheck'];
const VALUE_SOURCES = ['syllabus', 'past_paper', 'teacher', 'homework', 'textbook', 'guess'];
const UNCERTAINTY = ['low', 'medium', 'high'];
const REPRESENTATIONS = ['verbal', 'worked_example', 'faded_example', 'counterexample', 'graph', 'numeric', 'formal', 'analogy', 'hands_on'];
const LIGHT_KINDS = ['exposure', 'prediction', 'self_explain', 'self_report'];
const ACTIONS = ['diagnose', 'explain', 'practice', 'retest', 'advance', 'learn', 'skim', 'skip'];
const SCOPE_ACTIONS = ['learn', 'skim', 'skip'];

// ---------- schema helpers ----------

const int = (description: string): Schema => ({ type: 'integer', description });
const str = (description: string): Schema => ({ type: 'string', description });
const oneOf = (values: string[], description: string): Schema => ({ type: 'string', enum: values, description });
const obj = (properties: Json, required: string[] = []): Schema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

// ---------- argument helpers ----------

function need<T>(args: Json, key: string): T {
  const v = args[key];
  if (v === undefined || v === null || v === '') throw new ToolError(`missing required argument: ${key}`);
  return v as T;
}
function opt<T>(args: Json, key: string): T | null {
  const v = args[key];
  return v === undefined || v === '' ? null : (v as T);
}
function inEnum(value: unknown, allowed: string[], key: string): void {
  if (value === null || value === undefined) return;
  if (typeof value !== 'string' || !allowed.includes(value))
    throw new ToolError(`${key} must be one of: ${allowed.join(', ')}`);
}

async function first<T = Json>(env: Env, sql: string, ...params: unknown[]): Promise<T | null> {
  return (await env.DB.prepare(sql).bind(...params).first<T>()) ?? null;
}
async function all<T = Json>(env: Env, sql: string, ...params: unknown[]): Promise<T[]> {
  return (await env.DB.prepare(sql).bind(...params).all<T>()).results;
}
async function insertId(env: Env, sql: string, ...params: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql + ' RETURNING id').bind(...params).first<{ id: number }>();
  if (!row) throw new ToolError('insert failed');
  return row.id;
}
async function mustExist(env: Env, table: string, id: number, label = table): Promise<Json> {
  const row = await first(env, `SELECT * FROM ${table} WHERE id = ?`, id);
  if (!row) throw new ToolError(`${label} ${id} not found`);
  return row;
}

// ---------- decision bookkeeping ----------

// A planned decision is stale when the node's state was re-assessed after the decision was made.
const STALE_SQL = `(d.status = 'planned' AND EXISTS (SELECT 1 FROM knowledge_states k WHERE k.node_id = d.node_id AND k.assessed_at > d.decided_at))`;

async function plannedFor(env: Env, nodeIds: number[]) {
  if (!nodeIds.length) return [];
  return all(
    env,
    `SELECT d.id, d.node_id, d.action, d.reason, d.decided_at, ${STALE_SQL} AS stale
     FROM decisions d WHERE d.status = 'planned' AND d.node_id IN (${nodeIds.map(() => '?').join(',')})
     ORDER BY d.decided_at`,
    ...nodeIds,
  );
}

async function completeDecision(env: Env, decisionId: number, nodeIds: number[], sessionId: number | null, outcome: string | null) {
  const d = await mustExist(env, 'decisions', decisionId, 'decision');
  if (d.status !== 'planned') throw new ToolError(`decision ${decisionId} is ${d.status}, not planned`);
  if (d.node_id !== null && !nodeIds.includes(d.node_id as number))
    throw new ToolError(`decision ${decisionId} is about node ${d.node_id}, not the node(s) recorded here`);
  await env.DB.prepare(
    `UPDATE decisions SET status = 'done', done_session = COALESCE(?, done_session), outcome = COALESCE(?, outcome) WHERE id = ?`,
  )
    .bind(sessionId, outcome, decisionId)
    .run();
  return decisionId;
}

const CLOSE_HINT =
  'These planned decisions on the same node(s) are still open. If one was just carried out, close it with update_decision (status done, with outcome); if new evidence makes it unnecessary, revoke it with a reason. Leave it only if it still applies.';

const executesSchema = {
  executes_decision_id: int('Id of the planned decision this activity carried out; it is marked done'),
  decision_outcome: str('What came of carrying out that decision'),
};

// ---------- read operations (shared with the web API) ----------

export async function overview(env: Env, courseId: number | null) {
  const courses = await all(
    env,
    `SELECT c.*,
       (SELECT COUNT(*) FROM nodes n WHERE n.course_id = c.id) AS node_count
     FROM courses c ${courseId ? 'WHERE c.id = ?' : ''} ORDER BY c.status, c.name`,
    ...(courseId ? [courseId] : []),
  );
  const assessments = await all(
    env,
    `SELECT * FROM assessments ${courseId ? 'WHERE course_id = ?' : ''} ORDER BY exam_date IS NULL, exam_date`,
    ...(courseId ? [courseId] : []),
  );
  const levels = await all(
    env,
    `SELECT course_id, level, COUNT(*) AS n FROM current_state ${courseId ? 'WHERE course_id = ?' : ''}
     GROUP BY course_id, level`,
    ...(courseId ? [courseId] : []),
  );
  const decisions = await all(
    env,
    `SELECT d.id, d.node_id, d.title, d.course_id, d.assessment_id, d.action, d.reason, d.condition, d.priority, d.status,
            d.exam_value, d.decided_at, ${STALE_SQL} AS stale
     FROM open_decisions d ${courseId ? 'WHERE d.course_id = ? OR d.node_id IN (SELECT id FROM nodes WHERE course_id = ?)' : ''}
     LIMIT 30`,
    ...(courseId ? [courseId, courseId] : []),
  );
  const lastSessions = await all(
    env,
    `SELECT * FROM sessions ${courseId ? 'WHERE course_id = ?' : ''} ORDER BY started_at DESC, id DESC LIMIT 3`,
    ...(courseId ? [courseId] : []),
  );
  return {
    courses: courses.map((c) => ({
      ...c,
      assessments: assessments.filter((a) => a.course_id === c.id),
      levels: Object.fromEntries(levels.filter((l) => l.course_id === c.id).map((l) => [l.level, l.n])),
    })),
    open_decisions: decisions,
    last_sessions: lastSessions,
  };
}

export async function courseTree(env: Env, courseId: number) {
  const course = await mustExist(env, 'courses', courseId, 'course');
  const assessments = await all(env, `SELECT * FROM assessments WHERE course_id = ? ORDER BY exam_date`, courseId);
  const nodes = await all(
    env,
    `SELECT n.id, n.title, n.kind, n.definition, s.level, s.weak_point, s.assessed_at, b.suggested_level, b.last_seen
     FROM nodes n
     JOIN current_state s ON s.node_id = n.id
     JOIN rule_baseline b ON b.node_id = n.id
     WHERE n.course_id = ? ORDER BY n.id`,
    courseId,
  );
  const values = await all(
    env,
    `SELECT v.node_id, v.assessment_id, v.value, v.uncertainty FROM current_values v
     JOIN nodes n ON n.id = v.node_id WHERE n.course_id = ?`,
    courseId,
  );
  const edges = await all(
    env,
    `SELECT e.* FROM edges e JOIN nodes n ON n.id = e.from_id WHERE n.course_id = ?`,
    courseId,
  );
  const scope = await all(
    env,
    `SELECT node_id, assessment_id, action, reason, condition FROM decisions
     WHERE status = 'active' AND action IN ('learn','skim','skip')
       AND node_id IN (SELECT id FROM nodes WHERE course_id = ?)`,
    courseId,
  );
  return { course, assessments, nodes, values, edges, scope_decisions: scope };
}

export async function nodeDetail(env: Env, nodeId: number) {
  const node = await mustExist(env, 'nodes', nodeId, 'node');
  const [edgesOut, edgesIn, states, values, evidence, decisions, baseline, representations] = await Promise.all([
    all(env, `SELECT e.relation, e.note, e.to_id AS node_id, n.title FROM edges e JOIN nodes n ON n.id = e.to_id WHERE e.from_id = ?`, nodeId),
    all(env, `SELECT e.relation, e.note, e.from_id AS node_id, n.title FROM edges e JOIN nodes n ON n.id = e.from_id WHERE e.to_id = ?`, nodeId),
    all(env, `SELECT * FROM knowledge_states WHERE node_id = ? ORDER BY assessed_at DESC, id DESC LIMIT 8`, nodeId),
    all(env, `SELECT v.*, a.name AS assessment FROM current_values v JOIN assessments a ON a.id = v.assessment_id WHERE v.node_id = ?`, nodeId),
    all(
      env,
      `SELECT e.id, e.kind, e.outcome, e.qualifier, e.representation, e.interpretation, e.note, e.observed_at, e.attempt_id,
              a.context, a.hints, a.overall, a.self_signal, a.confidence,
              t.source AS task_source, t.source_ref, t.prompt AS task_prompt,
              ts.step_no, ts.role, ts.description AS step_description,
              (SELECT json_group_array(difficulty) FROM evidence_difficulties d WHERE d.evidence_id = e.id) AS difficulties
       FROM evidence e
       LEFT JOIN attempts a ON a.id = e.attempt_id
       LEFT JOIN tasks t ON t.id = a.task_id
       LEFT JOIN task_steps ts ON ts.id = e.step_id
       WHERE e.node_id = ? ORDER BY e.observed_at DESC, e.id DESC LIMIT 20`,
      nodeId,
    ),
    all(env, `SELECT d.*, ${STALE_SQL} AS stale FROM decisions d WHERE d.node_id = ? ORDER BY d.decided_at DESC, d.id DESC LIMIT 10`, nodeId),
    first(env, `SELECT * FROM rule_baseline WHERE node_id = ?`, nodeId),
    // How each way of explaining has gone so far: the following prediction/step outcomes after it was used
    all(
      env,
      `SELECT x.representation, COUNT(*) AS times_used, MAX(x.observed_at) AS last_used,
         (SELECT COUNT(*) FROM evidence p WHERE p.node_id = x.node_id AND p.kind = 'prediction'
            AND p.representation = x.representation AND p.outcome = 'failed') AS failed_checks
       FROM evidence x WHERE x.node_id = ? AND x.representation IS NOT NULL
       GROUP BY x.representation ORDER BY last_used DESC`,
      nodeId,
    ),
  ]);
  return {
    node,
    current_state: states[0] ?? { level: 'unknown' },
    state_history: states,
    rule_baseline: baseline,
    representations_tried: representations,
    values,
    edges: { outgoing: edgesOut, incoming: edgesIn },
    evidence: evidence.map((e) => ({ ...e, difficulties: JSON.parse(String(e.difficulties ?? '[]')) })),
    decisions,
  };
}

// ---------- tools ----------

const nodeId = int('Knowledge node id (look it up with find_nodes)');

export const TOOLS: Tool[] = [
  {
    name: 'overview',
    readOnly: true,
    description:
      'Start here. Lists courses with their assessments (exams), how many nodes sit in each knowledge state, open/active teaching decisions, and the last few session summaries (where the student stopped). A decision with stale=1 is planned but the node was re-assessed after it was made: before acting on it, check get_node and either carry it out, or close/revoke it with update_decision.',
    inputSchema: obj({ course_id: int('Limit to one course') }),
    run: (env, a) => overview(env, opt<number>(a, 'course_id')),
  },
  {
    name: 'find_nodes',
    readOnly: true,
    description: 'Search knowledge nodes by title substring, course and/or current state level.',
    inputSchema: obj({
      query: str('Substring of the node title'),
      course_id: int('Course id'),
      level: oneOf(LEVELS, 'Only nodes currently in this state'),
      limit: int('Max rows, default 30'),
    }),
    run: async (env, a) => {
      inEnum(opt(a, 'level'), LEVELS, 'level');
      const where: string[] = [];
      const params: unknown[] = [];
      const q = opt<string>(a, 'query');
      if (q) (where.push('n.title LIKE ?'), params.push(`%${q}%`));
      const c = opt<number>(a, 'course_id');
      if (c) (where.push('n.course_id = ?'), params.push(c));
      const l = opt<string>(a, 'level');
      if (l) (where.push('s.level = ?'), params.push(l));
      params.push(Math.min(opt<number>(a, 'limit') ?? 30, 200));
      return all(
        env,
        `SELECT n.id, n.course_id, n.title, n.kind, s.level, s.assessed_at
         FROM nodes n JOIN current_state s ON s.node_id = n.id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY n.course_id, n.id LIMIT ?`,
        ...params,
      );
    },
  },
  {
    name: 'get_node',
    readOnly: true,
    description:
      'Everything about one node: its facts, related nodes, current state and history, exam value per assessment, the most recent evidence (with task, step, context, hints, difficulty tags, representation and the student interpretation), which representations have been tried and how many embedded checks failed after each, decisions, and the mechanical rule_baseline suggestion.',
    inputSchema: obj({ node_id: nodeId }, ['node_id']),
    run: (env, a) => nodeDetail(env, need<number>(a, 'node_id')),
  },
  {
    name: 'review_candidates',
    readOnly: true,
    description:
      'Nodes most worth checking next in a course: weak, recheck, assisted or exposed nodes, and independent/validated ones not seen for 14+ days, ordered by exam value. Nodes with an active skip decision are left out. Use this to choose the next task; it is a ranking aid, not a schedule.',
    inputSchema: obj(
      { course_id: int('Course id'), assessment_id: int('Rank by value for this assessment'), limit: int('Default 10') },
      ['course_id'],
    ),
    run: async (env, a) => {
      const course = need<number>(a, 'course_id');
      const assessment = opt<number>(a, 'assessment_id');
      return all(
        env,
        `SELECT s.node_id, s.title, s.level, s.weak_point, b.suggested_level, b.last_seen,
                CAST(julianday('now') - julianday(b.last_seen) AS INTEGER) AS days_since_seen,
                v.value AS exam_value, v.uncertainty AS value_uncertainty
         FROM current_state s
         JOIN rule_baseline b ON b.node_id = s.node_id
         LEFT JOIN current_values v ON v.node_id = s.node_id AND v.assessment_id = ?
         WHERE s.course_id = ?
           AND NOT EXISTS (SELECT 1 FROM decisions d WHERE d.node_id = s.node_id AND d.status = 'active' AND d.action = 'skip')
           AND (s.level IN ('weak','recheck','assisted','exposed')
                OR (s.level IN ('independent','validated') AND julianday('now') - julianday(b.last_seen) >= 14)
                OR (s.level = 'unknown' AND b.last_seen IS NOT NULL))
         ORDER BY COALESCE(v.value, 1) DESC,
                  CASE s.level WHEN 'weak' THEN 0 WHEN 'recheck' THEN 1 WHEN 'assisted' THEN 2 WHEN 'exposed' THEN 3 ELSE 4 END,
                  b.last_seen
         LIMIT ?`,
        assessment,
        course,
        Math.min(opt<number>(a, 'limit') ?? 10, 50),
      );
    },
  },
  {
    name: 'upsert_course',
    description: 'Create a course, or update its status if a course with this name exists. Returns its id.',
    inputSchema: obj({ name: str('Course name'), status: oneOf(['active', 'paused', 'done'], 'Default active') }, ['name']),
    run: async (env, a) => {
      const status = opt<string>(a, 'status');
      inEnum(status, ['active', 'paused', 'done'], 'status');
      const row = await first<{ id: number }>(
        env,
        `INSERT INTO courses (name, status) VALUES (?, COALESCE(?, 'active'))
         ON CONFLICT(name) DO UPDATE SET status = COALESCE(excluded.status, courses.status)
         RETURNING id`,
        need<string>(a, 'name'),
        status,
      );
      return { course_id: row?.id };
    },
  },
  {
    name: 'upsert_assessment',
    description:
      'Create or update an assessment target of a course (midterm, final, a qualifying exam…). Exam value is always estimated per assessment.',
    inputSchema: obj(
      {
        course_id: int('Course id'),
        name: str('e.g. 期末考试'),
        exam_date: str('YYYY-MM-DD'),
        exam_format: str('Question types and weights'),
        scope_note: str('Scope and where that information came from'),
        status: oneOf(['upcoming', 'done', 'dropped'], 'Default upcoming'),
      },
      ['course_id', 'name'],
    ),
    run: async (env, a) => {
      inEnum(opt(a, 'status'), ['upcoming', 'done', 'dropped'], 'status');
      await mustExist(env, 'courses', need<number>(a, 'course_id'), 'course');
      const row = await first<{ id: number }>(
        env,
        `INSERT INTO assessments (course_id, name, exam_date, exam_format, scope_note, status)
         VALUES (?, ?, ?, ?, ?, COALESCE(?, 'upcoming'))
         ON CONFLICT(course_id, name) DO UPDATE SET
           exam_date = COALESCE(excluded.exam_date, assessments.exam_date),
           exam_format = COALESCE(excluded.exam_format, assessments.exam_format),
           scope_note = COALESCE(excluded.scope_note, assessments.scope_note),
           status = COALESCE(?, assessments.status)
         RETURNING id`,
        a.course_id,
        a.name,
        opt(a, 'exam_date'),
        opt(a, 'exam_format'),
        opt(a, 'scope_note'),
        opt(a, 'status'),
        opt(a, 'status'),
      );
      return { assessment_id: row?.id };
    },
  },
  {
    name: 'upsert_node',
    description:
      'Create a knowledge node, or fill in/replace facts of an existing node with the same course and title. Only facts about the knowledge itself belong here (definition, intuition, boundary conditions, common pitfalls); the student\'s state, exam value and learn/skip choices go elsewhere. Write every formula as LaTeX inside $...$ (inline) or $$...$$ (display), e.g. $P(y=1\\mid x)=\\sigma(w^\\top x+b)$; the web viewer renders only delimited LaTeX, so never use bare Unicode math like wᵀx or e^{w} without $ delimiters. The same applies to formulas in any other free-text field (notes, rationale, reasons).',
    inputSchema: obj(
      {
        course_id: int('Course id'),
        title: str('Node title, unique within the course'),
        kind: oneOf(KINDS, 'Node type'),
        definition: str('Rigorous definition or formula'),
        intuition: str('Intuitive explanation'),
        boundary: str('Conditions and counterexamples'),
        pitfalls: str('Common mistakes in general, not this student\'s'),
      },
      ['course_id', 'title', 'kind'],
    ),
    run: async (env, a) => {
      inEnum(need(a, 'kind'), KINDS, 'kind');
      await mustExist(env, 'courses', need<number>(a, 'course_id'), 'course');
      const row = await first<{ id: number }>(
        env,
        `INSERT INTO nodes (course_id, title, kind, definition, intuition, boundary, pitfalls)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(course_id, title) DO UPDATE SET
           kind = excluded.kind,
           definition = COALESCE(excluded.definition, nodes.definition),
           intuition = COALESCE(excluded.intuition, nodes.intuition),
           boundary = COALESCE(excluded.boundary, nodes.boundary),
           pitfalls = COALESCE(excluded.pitfalls, nodes.pitfalls)
         RETURNING id`,
        a.course_id,
        need<string>(a, 'title'),
        a.kind,
        opt(a, 'definition'),
        opt(a, 'intuition'),
        opt(a, 'boundary'),
        opt(a, 'pitfalls'),
      );
      return { node_id: row?.id };
    },
  },
  {
    name: 'link_nodes',
    description:
      'Add (or with remove=true delete) a relation between two nodes. prerequisite_of: from is needed before to. part_of: from is a part of to. confused_with / contrasts_with: easily mixed up or worth contrasting.',
    inputSchema: obj(
      {
        from_id: int('From node id'),
        to_id: int('To node id'),
        relation: oneOf(RELATIONS, 'Relation'),
        note: str('Why'),
        remove: { type: 'boolean', description: 'Delete the relation instead' },
      },
      ['from_id', 'to_id', 'relation'],
    ),
    run: async (env, a) => {
      inEnum(need(a, 'relation'), RELATIONS, 'relation');
      if (a.remove === true) {
        const r = await env.DB.prepare('DELETE FROM edges WHERE from_id = ? AND to_id = ? AND relation = ?')
          .bind(a.from_id, a.to_id, a.relation)
          .run();
        return { removed: r.meta.changes };
      }
      await mustExist(env, 'nodes', need<number>(a, 'from_id'), 'node');
      await mustExist(env, 'nodes', need<number>(a, 'to_id'), 'node');
      await env.DB.prepare(
        `INSERT INTO edges (from_id, to_id, relation, note) VALUES (?, ?, ?, ?)
         ON CONFLICT DO UPDATE SET note = COALESCE(excluded.note, edges.note)`,
      )
        .bind(a.from_id, a.to_id, a.relation, opt(a, 'note'))
        .run();
      return { ok: true };
    },
  },
  {
    name: 'start_session',
    description: 'Open a study session. Returns session_id to attach evidence to.',
    inputSchema: obj({
      course_id: int('Course id'),
      planned_min: int('Minutes the student has'),
      goal: str('应考 / 新概念 / 查漏补缺 / 巩固, in the student\'s words'),
    }),
    run: async (env, a) => ({
      session_id: await insertId(
        env,
        'INSERT INTO sessions (course_id, planned_min, goal) VALUES (?, ?, ?)',
        opt(a, 'course_id'),
        opt(a, 'planned_min'),
        opt(a, 'goal'),
      ),
    }),
  },
  {
    name: 'end_session',
    description:
      'Save the short end-of-session record: what was done, independent performance, where to start next time, what can be skipped for now. Returns any planned decisions on nodes studied in this session that are still open; close or revoke them before finishing.',
    inputSchema: obj({ session_id: int('Session id'), summary: str('Micro learning record') }, ['session_id', 'summary']),
    run: async (env, a) => {
      await mustExist(env, 'sessions', need<number>(a, 'session_id'), 'session');
      await env.DB.prepare('UPDATE sessions SET summary = ? WHERE id = ?').bind(need(a, 'summary'), a.session_id).run();
      const touched = await all<{ node_id: number }>(env, 'SELECT DISTINCT node_id FROM evidence WHERE session_id = ?', a.session_id);
      const open = await plannedFor(env, touched.map((t) => t.node_id));
      return open.length
        ? { ok: true, unclosed_decisions: open, hint: 'Nodes studied in this session still have planned decisions. ' + CLOSE_HINT }
        : { ok: true };
    },
  },
  {
    name: 'record_attempt',
    description:
      'Record one answered question. Describe the question as a task with steps, each step mapped to the node it exercises (core = what the question mainly tests, supporting = used along the way). Then give one result per step: demonstrated, failed, not_reached (never got there: no evidence either way) or unclear. A wrong answer only counts against the step that actually failed. Use qualifier guessed for a correct-but-guessed step and slip for a mere slip. confidence and self_signal are optional: fill them only if the student was asked or volunteered it; never invent them. Pass task_id instead of task to reuse a known question. If this question carried out a planned decision (e.g. a retest or practice), pass executes_decision_id to mark it done in the same call.',
    inputSchema: obj(
      {
        session_id: int('Session id'),
        task_id: int('Existing task id'),
        task: obj(
          {
            source: oneOf(TASK_SOURCES, 'Where the question came from'),
            source_ref: str('e.g. 2024 期末 第3题'),
            format: oneOf(FORMATS, 'Question format'),
            prompt: str('Question or a summary'),
            answer: str('Reference answer'),
            steps: {
              type: 'array',
              items: obj(
                { node_id: nodeId, role: oneOf(['core', 'supporting'], 'Default core'), description: str('What this step requires') },
                ['node_id'],
              ),
            },
          },
          ['source', 'steps'],
        ),
        context: oneOf(CONTEXTS, 'When/how it was answered'),
        hints: oneOf(HINTS, 'How much help was given'),
        overall: oneOf(OVERALL, 'Overall result'),
        confidence: int('0–100, only if the student gave it'),
        self_signal: oneOf(SELF_SIGNALS, 'Only if the student said it'),
        seconds_spent: int('Time spent'),
        note: str('Note'),
        ...executesSchema,
        step_results: {
          type: 'array',
          description: 'One entry per task step',
          items: obj(
            {
              step_no: int('1-based step number'),
              outcome: oneOf(OUTCOMES, 'Result on this step'),
              qualifier: oneOf(QUALIFIERS, 'Optional'),
              difficulties: { type: 'array', items: oneOf(DIFFICULTIES, 'Learning difficulty'), description: 'Optional, multi-select' },
              interpretation: str('What rule the student actually applied here, if it differs from the intended one'),
              note: str('What happened'),
            },
            ['step_no', 'outcome'],
          ),
        },
      },
      ['context', 'hints', 'overall', 'step_results'],
    ),
    run: async (env, a) => {
      inEnum(need(a, 'context'), CONTEXTS, 'context');
      inEnum(need(a, 'hints'), HINTS, 'hints');
      inEnum(need(a, 'overall'), OVERALL, 'overall');
      inEnum(opt(a, 'self_signal'), SELF_SIGNALS, 'self_signal');
      const sessionId = opt<number>(a, 'session_id');
      if (sessionId) await mustExist(env, 'sessions', sessionId, 'session');
      const results = need<Json[]>(a, 'step_results');
      for (const r of results) {
        inEnum(r.outcome, OUTCOMES, 'outcome');
        inEnum(r.qualifier ?? null, QUALIFIERS, 'qualifier');
        for (const d of (r.difficulties as string[] | undefined) ?? []) inEnum(d, DIFFICULTIES, 'difficulty');
        if (r.difficulties && (r.difficulties as string[]).length && r.outcome !== 'failed' && r.outcome !== 'unclear')
          throw new ToolError(`step ${r.step_no}: difficulties only apply to failed or unclear steps`);
      }

      let taskId = opt<number>(a, 'task_id');
      if (!taskId) {
        const t = need<Json>(a, 'task');
        inEnum(t.source, TASK_SOURCES, 'task.source');
        inEnum(t.format ?? null, FORMATS, 'task.format');
        const steps = (t.steps as Json[]) ?? [];
        if (!steps.length) throw new ToolError('task.steps must list at least one step');
        for (const s of steps) {
          inEnum(s.role ?? null, ['core', 'supporting'], 'role');
          await mustExist(env, 'nodes', s.node_id as number, 'node');
        }
        taskId = await insertId(
          env,
          'INSERT INTO tasks (source, source_ref, format, prompt, answer) VALUES (?, ?, ?, ?, ?)',
          t.source,
          t.source_ref ?? null,
          t.format ?? null,
          t.prompt ?? null,
          t.answer ?? null,
        );
        await env.DB.batch(
          steps.map((s, i) =>
            env.DB.prepare('INSERT INTO task_steps (task_id, step_no, node_id, description, role) VALUES (?, ?, ?, ?, ?)').bind(
              taskId,
              i + 1,
              s.node_id,
              s.description ?? null,
              s.role ?? 'core',
            ),
          ),
        );
      } else {
        await mustExist(env, 'tasks', taskId, 'task');
      }

      const steps = await all<{ id: number; step_no: number; node_id: number }>(
        env,
        'SELECT id, step_no, node_id FROM task_steps WHERE task_id = ?',
        taskId,
      );
      const byNo = new Map(steps.map((s) => [s.step_no, s]));
      for (const r of results)
        if (!byNo.has(r.step_no as number)) throw new ToolError(`task ${taskId} has no step ${r.step_no}`);

      const attemptId = await insertId(
        env,
        `INSERT INTO attempts (task_id, session_id, context, hints, overall, confidence, self_signal, seconds_spent, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        taskId,
        sessionId,
        a.context,
        a.hints,
        a.overall,
        opt(a, 'confidence'),
        opt(a, 'self_signal'),
        opt(a, 'seconds_spent'),
        opt(a, 'note'),
      );
      const evidenceIds: Record<number, number> = {};
      for (const r of results) {
        const step = byNo.get(r.step_no as number)!;
        const id = await insertId(
          env,
          `INSERT INTO evidence (node_id, attempt_id, step_id, session_id, kind, outcome, qualifier, interpretation, note)
           VALUES (?, ?, ?, ?, 'step', ?, ?, ?, ?)`,
          step.node_id,
          attemptId,
          step.id,
          sessionId,
          r.outcome,
          r.qualifier ?? null,
          r.interpretation ?? null,
          r.note ?? null,
        );
        evidenceIds[step.step_no] = id;
        const diffs = (r.difficulties as string[] | undefined) ?? [];
        if (diffs.length)
          await env.DB.batch(
            diffs.map((d) => env.DB.prepare('INSERT OR IGNORE INTO evidence_difficulties VALUES (?, ?)').bind(id, d)),
          );
      }
      const nodeIds = [...new Set(steps.map((s) => s.node_id))];
      const exec = opt<number>(a, 'executes_decision_id');
      const closed = exec ? await completeDecision(env, exec, nodeIds, sessionId, opt(a, 'decision_outcome')) : null;
      const open = await plannedFor(env, nodeIds);
      return {
        task_id: taskId,
        attempt_id: attemptId,
        evidence_ids_by_step: evidenceIds,
        ...(closed ? { closed_decision: closed } : {}),
        ...(open.length ? { open_decisions: open, hint: CLOSE_HINT } : {}),
      };
    },
  },
  {
    name: 'record_evidence',
    description:
      'Record evidence that is not a full answered question. exposure: the student was taught or read it; give representation (which way it was explained). prediction: a quick embedded check during teaching (predict, classify, judge an instance, give a counterexample); give outcome, representation and, above all, interpretation. self_explain: explained it in their own words; give outcome. self_report: student says they get it or not; weakest evidence. interpretation = what rule the student actually seems to be using, in particular a misreading (e.g. 以为边际分布相同就严格平稳). If this carried out a planned decision (e.g. the explanation an explain decision called for), pass executes_decision_id to mark it done in the same call.',
    inputSchema: obj(
      {
        node_id: nodeId,
        kind: oneOf(LIGHT_KINDS, 'Evidence kind'),
        session_id: int('Session id'),
        outcome: oneOf(OUTCOMES, 'For prediction and self_explain'),
        qualifier: oneOf(QUALIFIERS, 'Optional, e.g. guessed'),
        representation: oneOf(REPRESENTATIONS, 'How it was explained (exposure, prediction)'),
        interpretation: str('What the student took the rule to be'),
        difficulties: { type: 'array', items: oneOf(DIFFICULTIES, 'Learning difficulty') },
        note: str('What was observed'),
        ...executesSchema,
      },
      ['node_id', 'kind'],
    ),
    run: async (env, a) => {
      inEnum(need(a, 'kind'), LIGHT_KINDS, 'kind');
      inEnum(opt(a, 'outcome'), OUTCOMES, 'outcome');
      inEnum(opt(a, 'qualifier'), QUALIFIERS, 'qualifier');
      inEnum(opt(a, 'representation'), REPRESENTATIONS, 'representation');
      if (a.kind === 'prediction' && !opt(a, 'outcome')) throw new ToolError('prediction needs an outcome');
      await mustExist(env, 'nodes', need<number>(a, 'node_id'), 'node');
      const id = await insertId(
        env,
        `INSERT INTO evidence (node_id, session_id, kind, outcome, qualifier, representation, interpretation, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        a.node_id,
        opt(a, 'session_id'),
        a.kind,
        opt(a, 'outcome'),
        opt(a, 'qualifier'),
        opt(a, 'representation'),
        opt(a, 'interpretation'),
        opt(a, 'note'),
      );
      const diffs = (a.difficulties as string[] | undefined) ?? [];
      for (const d of diffs) inEnum(d, DIFFICULTIES, 'difficulty');
      if (diffs.length)
        await env.DB.batch(diffs.map((d) => env.DB.prepare('INSERT OR IGNORE INTO evidence_difficulties VALUES (?, ?)').bind(id, d)));
      const exec = opt<number>(a, 'executes_decision_id');
      const closed = exec ? await completeDecision(env, exec, [a.node_id as number], opt(a, 'session_id'), opt(a, 'decision_outcome')) : null;
      const open = await plannedFor(env, [a.node_id as number]);
      return {
        evidence_id: id,
        ...(closed ? { closed_decision: closed } : {}),
        ...(open.length ? { open_decisions: open, hint: CLOSE_HINT } : {}),
      };
    },
  },
  {
    name: 'assess_state',
    description:
      'Write a new knowledge-state judgement for a node (appended; history is kept). level: unknown, exposed, assisted, independent, validated, weak, recheck. basis must list the evidence ids it rests on (from this node), except for unknown. Check get_node\'s rule_baseline first and explain in rationale when you deviate from it. Returns the node\'s still-planned decisions: review each against the new state and close, revoke or keep it.',
    inputSchema: obj(
      {
        node_id: nodeId,
        level: oneOf(LEVELS, 'Knowledge state'),
        basis: { type: 'array', items: { type: 'integer' }, description: 'Evidence ids' },
        rationale: str('Why this judgement'),
        weak_point: str('Where exactly it breaks down, if anywhere'),
        assessed_by: oneOf(['ai', 'rule', 'self'], 'Default ai'),
      },
      ['node_id', 'level', 'rationale'],
    ),
    run: async (env, a) => {
      inEnum(need(a, 'level'), LEVELS, 'level');
      inEnum(opt(a, 'assessed_by'), ['ai', 'rule', 'self'], 'assessed_by');
      const node = need<number>(a, 'node_id');
      await mustExist(env, 'nodes', node, 'node');
      const basis = ((a.basis as number[] | undefined) ?? []).map(Number);
      if (a.level !== 'unknown' && !basis.length) throw new ToolError('basis must list at least one evidence id');
      if (basis.length) {
        const found = await all<{ id: number }>(
          env,
          `SELECT id FROM evidence WHERE node_id = ? AND id IN (${basis.map(() => '?').join(',')})`,
          node,
          ...basis,
        );
        const missing = basis.filter((b) => !found.some((f) => f.id === b));
        if (missing.length) throw new ToolError(`evidence ${missing.join(', ')} does not belong to node ${node}`);
      }
      const id = await insertId(
        env,
        `INSERT INTO knowledge_states (node_id, level, weak_point, basis, rationale, assessed_by) VALUES (?, ?, ?, ?, ?, ?)`,
        node,
        a.level,
        opt(a, 'weak_point'),
        JSON.stringify(basis),
        need(a, 'rationale'),
        opt(a, 'assessed_by') ?? 'ai',
      );
      const open = await plannedFor(env, [node]);
      return open.length
        ? { state_id: id, open_decisions: open, hint: 'The state just changed. ' + CLOSE_HINT }
        : { state_id: id };
    },
  },
  {
    name: 'estimate_value',
    description:
      'Record a new estimate of how much a node matters for one assessment (0 not examined, 1 low, 2 medium, 3 high). Always give the basis and uncertainty. value may be null when there is no material. A value of 3 needs at least one source other than guess: never call something must-know without material.',
    inputSchema: obj(
      {
        node_id: nodeId,
        assessment_id: int('Assessment id'),
        value: { type: ['integer', 'null'], minimum: 0, maximum: 3, description: '0–3 or null' },
        uncertainty: oneOf(UNCERTAINTY, 'How sure the estimate is'),
        sources: { type: 'array', items: oneOf(VALUE_SOURCES, 'Source type') },
        basis: str('e.g. 近 3 年真题出现 2 次'),
      },
      ['node_id', 'assessment_id', 'uncertainty', 'basis'],
    ),
    run: async (env, a) => {
      inEnum(need(a, 'uncertainty'), UNCERTAINTY, 'uncertainty');
      const sources = (a.sources as string[] | undefined) ?? [];
      for (const s of sources) inEnum(s, VALUE_SOURCES, 'source');
      const value = a.value === undefined ? null : (a.value as number | null);
      if (value !== null && (!Number.isInteger(value) || value < 0 || value > 3)) throw new ToolError('value must be 0–3 or null');
      if (value === 3 && !sources.some((s) => s !== 'guess'))
        throw new ToolError('value 3 needs at least one real source (syllabus, past_paper, teacher, homework or textbook)');
      await mustExist(env, 'nodes', need<number>(a, 'node_id'), 'node');
      await mustExist(env, 'assessments', need<number>(a, 'assessment_id'), 'assessment');
      const id = await insertId(
        env,
        'INSERT INTO node_values (node_id, assessment_id, value, uncertainty, sources, basis) VALUES (?, ?, ?, ?, ?, ?)',
        a.node_id,
        a.assessment_id,
        value,
        a.uncertainty,
        JSON.stringify(sources),
        need(a, 'basis'),
      );
      return { value_id: id };
    },
  },
  {
    name: 'decide',
    description:
      'Record a teaching decision. One-off actions (diagnose, explain, practice, retest, advance) start as planned. Scope decisions (learn, skim, skip) start active and replace the previous active scope decision for the same node and assessment, which is marked revoked. Always give the reason; give condition when it only holds for a while (e.g. 仅限期中前).',
    inputSchema: obj(
      {
        action: oneOf(ACTIONS, 'Action'),
        reason: str('Why'),
        node_id: int('Node id (omit for a course-level decision)'),
        course_id: int('Course id for a course-level decision'),
        assessment_id: int('Assessment this decision serves'),
        state_id: int('Knowledge state it is based on'),
        condition: str('When it stops applying'),
        priority: int('1 highest – 3 lowest'),
      },
      ['action', 'reason'],
    ),
    run: async (env, a) => {
      inEnum(need(a, 'action'), ACTIONS, 'action');
      const node = opt<number>(a, 'node_id');
      if (node) await mustExist(env, 'nodes', node, 'node');
      const pr = opt<number>(a, 'priority');
      if (pr !== null && (pr < 1 || pr > 3)) throw new ToolError('priority must be 1–3');
      const scope = SCOPE_ACTIONS.includes(a.action as string);
      const id = await insertId(
        env,
        `INSERT INTO decisions (node_id, course_id, state_id, assessment_id, action, reason, condition, priority, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        node,
        opt(a, 'course_id'),
        opt(a, 'state_id'),
        opt(a, 'assessment_id'),
        a.action,
        need(a, 'reason'),
        opt(a, 'condition'),
        pr,
        scope ? 'active' : 'planned',
      );
      let replaced = 0;
      if (scope && node) {
        const r = await env.DB.prepare(
          `UPDATE decisions SET status = 'revoked', revoked_at = datetime('now'),
             revoked_why = 'replaced by decision ' || ?, superseded_by = ?
           WHERE node_id = ? AND status = 'active' AND action IN ('learn','skim','skip') AND id <> ?
             AND assessment_id IS ?`,
        )
          .bind(id, id, node, id, opt(a, 'assessment_id'))
          .run();
        replaced = r.meta.changes;
      }
      return { decision_id: id, status: scope ? 'active' : 'planned', replaced };
    },
  },
  {
    name: 'update_decision',
    description: 'Close a decision: done (with outcome) or revoked (with revoked_why, e.g. new evidence or the exam changed).',
    inputSchema: obj(
      {
        decision_id: int('Decision id'),
        status: oneOf(['done', 'revoked'], 'New status'),
        outcome: str('What happened after acting on it'),
        revoked_why: str('Why it no longer holds'),
        superseded_by: int('Decision that replaces it'),
        done_session: int('Session it was carried out in'),
      },
      ['decision_id', 'status'],
    ),
    run: async (env, a) => {
      inEnum(need(a, 'status'), ['done', 'revoked'], 'status');
      await mustExist(env, 'decisions', need<number>(a, 'decision_id'), 'decision');
      if (a.status === 'revoked' && !opt(a, 'revoked_why')) throw new ToolError('revoked_why is required when revoking');
      await env.DB.prepare(
        `UPDATE decisions SET status = ?, outcome = COALESCE(?, outcome),
           revoked_at = CASE WHEN ? = 'revoked' THEN datetime('now') ELSE revoked_at END,
           revoked_why = COALESCE(?, revoked_why), superseded_by = COALESCE(?, superseded_by),
           done_session = COALESCE(?, done_session)
         WHERE id = ?`,
      )
        .bind(a.status, opt(a, 'outcome'), a.status, opt(a, 'revoked_why'), opt(a, 'superseded_by'), opt(a, 'done_session'), a.decision_id)
        .run();
      return { ok: true };
    },
  },
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));
