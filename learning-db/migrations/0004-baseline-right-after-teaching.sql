-- rule_baseline：紧跟讲解后的无提示做对只建议 assisted，independent 要在 delayed / mixed / timed / unseen_variant 情境下无提示做对。
-- 只重建视图，列不变，旧 Worker 照常工作。先在 D1 上跑本脚本，再部署 Worker：
-- npx wrangler d1 execute learning-knowledge --remote --file migrations/0004-baseline-right-after-teaching.sql
DROP VIEW IF EXISTS rule_baseline;
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
    WHEN EXISTS (SELECT 1 FROM steps WHERE steps.node_id = n.id AND outcome = 'demonstrated' AND hints = 'none'
                   AND context <> 'right_after_teaching') THEN 'independent'
    ELSE 'assisted'
  END AS suggested_level
FROM nodes n;
