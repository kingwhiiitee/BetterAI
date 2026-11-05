-- v0.2 → v0.3：前置关系权重 + 跨学科。先在 D1 上跑本脚本，再部署 Worker；新列都有默认值或可空，旧 Worker 照常工作。
-- npx wrangler d1 execute learning-knowledge --remote --file migrations/0003-prereq-weights-cross-subject.sql
ALTER TABLE courses ADD COLUMN subject TEXT;
ALTER TABLE courses ADD COLUMN kind TEXT NOT NULL DEFAULT 'course' CHECK (kind IN ('course','foundation'));

ALTER TABLE nodes ADD COLUMN prereqs_reviewed_at TEXT;

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
