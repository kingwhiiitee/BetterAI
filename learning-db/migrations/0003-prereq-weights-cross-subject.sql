-- v0.2 → v0.3：前置关系权重 + 跨学科知识点
-- 与旧版 Worker 兼容：新列都有默认值或可空，旧代码照常读写。
-- 运行：npx wrangler d1 execute learning-knowledge --remote --file migrations/0003-prereq-weights-cross-subject.sql

-- 课程：学科 + 是否为跨课程共享的基础知识库
ALTER TABLE courses ADD COLUMN subject TEXT;
ALTER TABLE courses ADD COLUMN kind TEXT NOT NULL DEFAULT 'course' CHECK (kind IN ('course','foundation'));

-- 节点：前置知识链最近一次梳理完成的时间
ALTER TABLE nodes ADD COLUMN prereqs_reviewed_at TEXT;

-- 关系：加 weight / needed_layer，relation 增加 analogous_to（CHECK 只能重建表来改）
CREATE TABLE edges_v3 (
  from_id       INTEGER NOT NULL REFERENCES nodes(id),
  to_id         INTEGER NOT NULL REFERENCES nodes(id),
  relation      TEXT NOT NULL CHECK (relation IN ('prerequisite_of','part_of','confused_with','contrasts_with','analogous_to')),
  note          TEXT,
  weight        INTEGER NOT NULL DEFAULT 2 CHECK (weight BETWEEN 1 AND 3),
  needed_layer  TEXT CHECK (needed_layer IN ('use','mechanism','principle','boundary')),
  PRIMARY KEY (from_id, to_id, relation),
  CHECK (from_id <> to_id)
);
INSERT INTO edges_v3 (from_id, to_id, relation, note) SELECT from_id, to_id, relation, note FROM edges;
DROP TABLE edges;
ALTER TABLE edges_v3 RENAME TO edges;
CREATE INDEX idx_edges_to ON edges(to_id, relation);
