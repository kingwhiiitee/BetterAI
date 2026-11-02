-- 个人学习知识树 · D1 (SQLite) 表结构 v0.2（已部署到 D1 learning-knowledge）
-- 按 Evidence-Centered Design 分四层：
--   ① 知识节点（知识本身）  ② 学习证据（可观察表现）
--   ③ 知识状态（基于证据的推断） ④ 教学决策（下一步做什么）
-- 第 ① 层不随你的表现变化；②③④ 都是你与知识之间的关系。

PRAGMA foreign_keys = ON;

-- ───────── ① 知识节点 ─────────

CREATE TABLE courses (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','done')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE nodes (
  id            INTEGER PRIMARY KEY,
  course_id     INTEGER NOT NULL REFERENCES courses(id),
  title         TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('concept','definition','theorem','formula','method','problem_type')),
  definition    TEXT,                 -- 严谨定义 / 公式
  intuition     TEXT,                 -- 直觉解释
  boundary      TEXT,                 -- 适用条件、反例
  pitfalls      TEXT,                 -- 普遍易错点（不是你个人的错）
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (course_id, title)
);

-- 考核目标：同一门课可以有期中、期末、考研等不同目标
CREATE TABLE assessments (
  id            INTEGER PRIMARY KEY,
  course_id     INTEGER NOT NULL REFERENCES courses(id),
  name          TEXT NOT NULL,        -- 如 "期末考试" "考研 408"
  exam_date     TEXT,
  exam_format   TEXT,                 -- 题型与分值
  scope_note    TEXT,                 -- 考试范围及其来源
  status        TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','done','dropped')),
  UNIQUE (course_id, name)
);

-- 考核价值：节点 × 考核目标，只追加，最新一行为当前估计
-- 没有资料时 value 可为空、uncertainty='high'，不得凭空写"必考"
CREATE TABLE node_values (
  id            INTEGER PRIMARY KEY,
  node_id       INTEGER NOT NULL REFERENCES nodes(id),
  assessment_id INTEGER NOT NULL REFERENCES assessments(id),
  value         INTEGER CHECK (value BETWEEN 0 AND 3),       -- 0 不考 · 1 低 · 2 中 · 3 高
  uncertainty   TEXT NOT NULL CHECK (uncertainty IN ('low','medium','high')),
  sources       TEXT,                 -- JSON 数组：syllabus/past_paper/teacher/homework/textbook
  basis         TEXT NOT NULL,        -- 推断依据，如 "近 3 年真题出现 2 次"
  assessed_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE edges (
  from_id       INTEGER NOT NULL REFERENCES nodes(id),
  to_id         INTEGER NOT NULL REFERENCES nodes(id),
  relation      TEXT NOT NULL CHECK (relation IN ('prerequisite_of','part_of','confused_with','contrasts_with')),
  note          TEXT,
  PRIMARY KEY (from_id, to_id, relation),
  CHECK (from_id <> to_id)
);

-- 评价任务（ECD 的 task model）：一道题可考多个节点
CREATE TABLE tasks (
  id            INTEGER PRIMARY KEY,
  source        TEXT NOT NULL CHECK (source IN ('past_paper','textbook','homework','teacher_sample','ai_generated')),
  source_ref    TEXT,                 -- 出处，如 "2024 期末 第3题"
  format        TEXT CHECK (format IN ('choice','fill','calculation','proof','short_answer','other')),
  prompt        TEXT,                 -- 题目或摘要
  answer        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 题目模型：这道题分几步、每步考哪个节点
-- 例：BP 计算题 → ①前向传播 ②激活函数导数 ③链式法则 ④误差反传 ⑤矩阵维度
CREATE TABLE task_steps (
  id            INTEGER PRIMARY KEY,
  task_id       INTEGER NOT NULL REFERENCES tasks(id),
  step_no       INTEGER NOT NULL,
  node_id       INTEGER NOT NULL REFERENCES nodes(id),
  description   TEXT,                 -- 这一步要做什么
  role          TEXT NOT NULL DEFAULT 'core' CHECK (role IN ('core','supporting')),
                                      -- core：这道题主要想考的；supporting：顺带用到的
  UNIQUE (task_id, step_no)
);

-- ───────── ② 学习证据 ─────────

CREATE TABLE sessions (
  id            INTEGER PRIMARY KEY,
  course_id     INTEGER REFERENCES courses(id),
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  planned_min   INTEGER,
  goal          TEXT,
  summary       TEXT                  -- 本轮完成（微型学习记录）
);

-- 作答：一次完整的答题行为（题目层面）
CREATE TABLE attempts (
  id            INTEGER PRIMARY KEY,
  task_id       INTEGER REFERENCES tasks(id),
  session_id    INTEGER REFERENCES sessions(id),
  answered_at   TEXT NOT NULL DEFAULT (datetime('now')),
  context       TEXT NOT NULL CHECK (context IN ('right_after_teaching','delayed','mixed','timed','unseen_variant')),
  hints         TEXT NOT NULL CHECK (hints IN ('none','partial','full')),
  overall       TEXT NOT NULL CHECK (overall IN ('correct','partial','wrong')),
  confidence    INTEGER CHECK (confidence BETWEEN 0 AND 100),  -- 可选，仅在 AI 偶尔询问时填；未提供即 NULL
  self_signal   TEXT CHECK (self_signal IN ('sure','unsure','guessed')),  -- 你主动说的"我猜的""不确定"，没说即 NULL
  seconds_spent INTEGER,
  note          TEXT
);

-- 证据：落到单个节点上的观察（节点层面）
-- 一道题做错，只给"真正出错的那一步"记 failed；
-- 做对的步骤记 demonstrated；没做到的步骤记 not_reached，不算任何证据。
CREATE TABLE evidence (
  id            INTEGER PRIMARY KEY,
  node_id       INTEGER NOT NULL REFERENCES nodes(id),
  attempt_id    INTEGER REFERENCES attempts(id),   -- 来自作答时填
  step_id       INTEGER REFERENCES task_steps(id),
  session_id    INTEGER REFERENCES sessions(id),
  observed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  kind          TEXT NOT NULL CHECK (kind IN (
                  'step',             -- 作答中某一步的表现
                  'exposure',         -- 听过讲解 / 读过材料
                  'prediction',       -- 讲解中穿插的预测、分类、判断或举反例
                  'self_explain',     -- 你用自己的话解释
                  'self_report'       -- 主观"懂了/不懂"，权重最低
                )),
  outcome       TEXT CHECK (outcome IN ('demonstrated','failed','not_reached','unclear')),
  qualifier     TEXT CHECK (qualifier IN (
                  'guessed',          -- 答对但是猜的：不算掌握证据
                  'slip',             -- 答错但只是手误：不算知识缺口
                  'lucky_path'        -- 方法不对却碰巧得到正确结果
                )),
  representation TEXT CHECK (representation IN (
                  'verbal',           -- 文字解释
                  'worked_example',   -- 完整已解例题
                  'faded_example',    -- 逐步撤除步骤的例题
                  'counterexample',   -- 正例 / 反例 / 边界案例
                  'graph',            -- 图形、示意图
                  'numeric',          -- 具体数值演算
                  'formal',           -- 符号推导、证明
                  'analogy',          -- 类比
                  'hands_on'          -- 动手操作、模拟、代码
                )),                   -- 讲解用了哪种表征（exposure / prediction 时填）
  interpretation TEXT,                -- 学生把规则理解成了什么（尤其是理解偏差）
  note          TEXT,
  CHECK (kind <> 'step' OR (attempt_id IS NOT NULL AND outcome IS NOT NULL))
);

-- 学习困难：可多选，不互斥（Skill §4A 的六类）
CREATE TABLE evidence_difficulties (
  evidence_id   INTEGER NOT NULL REFERENCES evidence(id),
  difficulty    TEXT NOT NULL CHECK (difficulty IN (
                  'unknown_concept',  -- 不认识概念
                  'condition',        -- 知道定义但不理解条件
                  'recognition',      -- 理解原理但不会识别题型
                  'execution',        -- 会识别但不会计算
                  'transfer',         -- 会同型题但不会变式
                  'forgetting'        -- 当时会，延迟后遗忘
                )),
  PRIMARY KEY (evidence_id, difficulty)
);

-- ───────── ③ 知识状态 ─────────
-- 只追加不修改：每次评估写一行，最新一行就是当前状态，历史可追溯

CREATE TABLE knowledge_states (
  id            INTEGER PRIMARY KEY,
  node_id       INTEGER NOT NULL REFERENCES nodes(id),
  assessed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  level         TEXT NOT NULL CHECK (level IN (
                  'unknown',          -- 没有足够证据，不知道是否掌握
                  'exposed',          -- 接触或学习过，尚无有效独立作答证据
                  'assisted',         -- 有提示时能够完成
                  'independent',      -- 已在无提示情境下正确作答
                  'validated',        -- 有跨时间、跨题型或陌生变式的支持证据
                  'weak',             -- 当前存在明确的知识或技能缺口
                  'recheck'           -- 旧证据不足以支持当前判断，需要重新检验
                )),
  weak_point    TEXT,                 -- 当前卡在哪个环节（对应学习困难类型或更细的描述）
  basis         TEXT NOT NULL,        -- 依据的 evidence id，JSON 数组，如 "[12,15]"
  rationale     TEXT,                 -- 为什么这样判断
  assessed_by   TEXT NOT NULL CHECK (assessed_by IN ('rule','ai','self'))
);

-- ───────── ④ 教学决策 ─────────

CREATE TABLE decisions (
  id            INTEGER PRIMARY KEY,
  node_id       INTEGER REFERENCES nodes(id),       -- 可空：如"本周暂停这门课"
  course_id     INTEGER REFERENCES courses(id),
  state_id      INTEGER REFERENCES knowledge_states(id),  -- 依据哪次状态判断
  decided_at    TEXT NOT NULL DEFAULT (datetime('now')),
  assessment_id INTEGER REFERENCES assessments(id),    -- 针对哪个考核目标做的决定
  action        TEXT NOT NULL CHECK (action IN ('diagnose','explain','practice','retest','advance','learn','skim','skip')),
  reason        TEXT NOT NULL,
  condition     TEXT,                 -- 适用条件，如 "仅限本次期中前"
  priority      INTEGER CHECK (priority BETWEEN 1 AND 3),   -- 1 最高
  status        TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
                  'planned',          -- 待执行（讲解/练习/复测等一次性动作）
                  'active',           -- 持续生效（learn/skim/skip 这类范围决定）
                  'done',
                  'revoked'           -- 被新证据推翻
                )),
  revoked_at    TEXT,
  revoked_why   TEXT,
  superseded_by INTEGER REFERENCES decisions(id),
  done_session  INTEGER REFERENCES sessions(id),
  outcome       TEXT                  -- 执行后效果
);

-- ───────── 索引与视图 ─────────

CREATE INDEX idx_nodes_course     ON nodes(course_id);
CREATE INDEX idx_edges_to         ON edges(to_id, relation);
CREATE INDEX idx_evidence_node    ON evidence(node_id, observed_at);
CREATE INDEX idx_states_node      ON knowledge_states(node_id, assessed_at);
CREATE INDEX idx_decisions_open   ON decisions(status, priority);
CREATE INDEX idx_values_node      ON node_values(node_id, assessment_id, assessed_at);

-- 当前状态：每个节点最新一次评估；没有评估的节点视为 unknown
CREATE VIEW current_state AS
SELECT n.id AS node_id, n.course_id, n.title,
       COALESCE(s.level, 'unknown') AS level,
       s.weak_point, s.assessed_at, s.assessed_by, s.rationale
FROM nodes n
LEFT JOIN knowledge_states s
  ON s.id = (SELECT id FROM knowledge_states k WHERE k.node_id = n.id
             ORDER BY assessed_at DESC, id DESC LIMIT 1);

-- 规则基线：只看证据给出的机械判断，供 AI 写入状态前参考（不直接当结论）
CREATE VIEW rule_baseline AS
WITH steps AS (
  SELECT e.node_id, e.outcome, e.observed_at, a.hints, a.context,
         ROW_NUMBER() OVER (PARTITION BY e.node_id ORDER BY e.observed_at DESC, e.id DESC) AS rn
  FROM evidence e JOIN attempts a ON a.id = e.attempt_id
  WHERE e.kind = 'step' AND e.outcome IN ('demonstrated','failed')
    AND NOT (e.outcome = 'demonstrated' AND COALESCE(e.qualifier,'') IN ('guessed','lucky_path'))
    AND NOT (e.outcome = 'failed' AND COALESCE(e.qualifier,'') = 'slip')
)
SELECT n.id AS node_id,
  (SELECT MAX(observed_at) FROM evidence e WHERE e.node_id = n.id) AS last_seen,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM evidence e WHERE e.node_id = n.id) THEN 'unknown'
    WHEN NOT EXISTS (SELECT 1 FROM steps WHERE steps.node_id = n.id) THEN 'exposed'
    WHEN EXISTS (SELECT 1 FROM steps WHERE steps.node_id = n.id AND rn = 1 AND outcome = 'failed') THEN 'weak'
    WHEN (SELECT COUNT(DISTINCT date(observed_at)) FROM steps
          WHERE steps.node_id = n.id AND outcome = 'demonstrated' AND hints = 'none'
            AND context IN ('delayed','mixed','unseen_variant')) >= 2 THEN 'validated'
    WHEN EXISTS (SELECT 1 FROM steps WHERE steps.node_id = n.id AND outcome = 'demonstrated' AND hints = 'none') THEN 'independent'
    ELSE 'assisted'
  END AS suggested_level
FROM nodes n;

-- 当前考核价值：每个节点 × 考核目标的最新估计
CREATE VIEW current_values AS
SELECT v.* FROM node_values v
WHERE v.id = (SELECT id FROM node_values w
              WHERE w.node_id = v.node_id AND w.assessment_id = v.assessment_id
              ORDER BY assessed_at DESC, id DESC LIMIT 1);

-- 待办与生效中的决策
CREATE VIEW open_decisions AS
SELECT d.*, n.title, cv.value AS exam_value, cv.uncertainty AS value_uncertainty
FROM decisions d
LEFT JOIN nodes n ON n.id = d.node_id
LEFT JOIN current_values cv ON cv.node_id = d.node_id AND cv.assessment_id = d.assessment_id
WHERE d.status IN ('planned','active')
ORDER BY d.status, d.priority, cv.value DESC, d.decided_at;
