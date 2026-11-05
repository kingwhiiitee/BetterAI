import { useMemo, useState } from "react";
import type { Key } from "react-aria-components";
import { RiNodeTree, RiLayoutColumnLine } from "@remixicon/react";
import { Breadcrumb, BreadcrumbItem } from "@/components/base/breadcrumb/breadcrumb";
import { Chip } from "@/components/base/badges/chip";
import { SearchField } from "@/components/base/search-field/search-field";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { Tabs, TabList, Tab, TabPanel } from "@/components/base/tabs/tabs";
import { useApi, type CourseTree, type Level, type TreeNode, type ValueRow, type ScopeDecision } from "@/lib/api";
import { ACTION, KIND, LEVEL, LEVELS, WEIGHT, daysUntil } from "@/lib/labels";
import { MathText } from "@/components/math-text";
import { href } from "@/lib/router";
import { Card, CardTitle, Empty, ErrorCard, LevelChip, Loading, PageHeader, ValuePips } from "@/components/ui";
import { cx } from "@/utils/cx";
import { LEVEL_BAR } from "./Overview";

interface Ctx {
  values: Map<number, ValueRow>;
  scope: Map<number, ScopeDecision>;
  prereqCount: Map<number, number>;
}

export function CoursePage({ id }: { id: number }) {
  const { data, error, loading } = useApi<CourseTree>(`/courses/${id}`);
  const [assessment, setAssessment] = useState<Key | null>(null);
  const [query, setQuery] = useState("");

  const activeAssessment = assessment ?? data?.assessments.find((a) => a.status === "upcoming")?.id ?? data?.assessments[0]?.id ?? null;

  const ctx = useMemo<Ctx>(() => {
    const aid = activeAssessment === null ? null : Number(activeAssessment);
    const values = new Map<number, ValueRow>();
    const scope = new Map<number, ScopeDecision>();
    const prereqCount = new Map<number, number>();
    for (const v of data?.values ?? []) if (v.assessment_id === aid) values.set(v.node_id, v);
    for (const s of data?.scope_decisions ?? [])
      if (s.assessment_id === aid || s.assessment_id === null) scope.set(s.node_id, s);
    for (const e of data?.edges ?? [])
      if (e.relation === "prerequisite_of") prereqCount.set(e.to_id, (prereqCount.get(e.to_id) ?? 0) + 1);
    return { values, scope, prereqCount };
  }, [data, activeAssessment]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorCard error={error!} />;

  const q = query.trim().toLowerCase();
  const nodes = q
    ? data.nodes.filter((n) => n.title.toLowerCase().includes(q) || (n.definition ?? "").toLowerCase().includes(q))
    : data.nodes;
  const current = data.assessments.find((a) => a.id === Number(activeAssessment));
  const days = current ? daysUntil(current.exam_date) : null;

  return (
    <>
      <Breadcrumb className="mb-3">
        <BreadcrumbItem href={href.overview}>知识库</BreadcrumbItem>
        <BreadcrumbItem current>{data.course.name}</BreadcrumbItem>
      </Breadcrumb>
      <PageHeader
        title={data.course.name}
        sub={
          <>
            {data.nodes.length} 个知识点
            {current ? ` · 考核目标：${current.name}${days !== null && days >= 0 ? `（还有 ${days} 天）` : ""}` : ""}
          </>
        }
        extra={
          data.assessments.length > 1 ? (
            <SegmentedControl
              aria-label="考核目标"
              selectedKeys={activeAssessment !== null ? [activeAssessment] : []}
              onSelectionChange={(keys) => {
                const k = [...keys][0];
                if (k !== undefined) setAssessment(k);
              }}
            >
              {data.assessments.map((a) => (
                <SegmentedControlItem key={a.id} id={a.id}>
                  {a.name}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          ) : null
        }
      />

      {current && (current.exam_format || current.scope_note) ? (
        <Card className="mb-4 flex flex-col gap-1 py-4">
          {current.exam_format ? (
            <p className="text-body-2-regular text-text-secondary">
              <span className="text-text-tertiary">题型：</span>
              {current.exam_format}
            </p>
          ) : null}
          {current.scope_note ? (
            <p className="text-body-2-regular text-text-secondary">
              <span className="text-text-tertiary">范围：</span>
              {current.scope_note}
            </p>
          ) : null}
        </Card>
      ) : null}

      <Tabs defaultSelectedKey="board">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <TabList aria-label="视图">
              <Tab id="board" icon={RiLayoutColumnLine}>
                按状态
              </Tab>
              <Tab id="graph" icon={RiNodeTree}>
                前置关系
              </Tab>
            </TabList>
          </div>
          <SearchField
            aria-label="搜索知识点"
            placeholder="搜索知识点"
            size="small"
            value={query}
            onChange={setQuery}
            clearLabel="清除"
            className="mb-1 w-full sm:w-56"
          />
        </div>
        <TabPanel id="board">
          <StateBoard nodes={nodes} ctx={ctx} />
        </TabPanel>
        <TabPanel id="graph">
          <PrereqGraph nodes={nodes} edges={data.edges} ctx={ctx} />
          <ExternalPrereqs data={data} />
        </TabPanel>
      </Tabs>
    </>
  );
}

// ---------- by-state board ----------

function StateBoard({ nodes, ctx }: { nodes: TreeNode[]; ctx: Ctx }) {
  if (!nodes.length) return <Empty>没有匹配的知识点</Empty>;
  const groups = LEVELS.map((l) => ({ level: l, items: nodes.filter((n) => n.level === l) })).filter((g) => g.items.length);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => (
        <section
          key={g.level}
          className="flex flex-col gap-3 rounded-3xl border border-border-button-default bg-background-secondary-default p-3"
        >
          <header className="flex items-center gap-2 px-2 pt-1">
            <span className={cx("size-2 rounded-full", LEVEL_BAR[g.level])} />
            <h3 className="text-body-semibold text-text-primary">{LEVEL[g.level].label}</h3>
            <span className="text-caption-1-medium text-text-tertiary">{g.items.length}</span>
            <span className="ms-auto truncate text-caption-2-regular text-text-tertiary">{LEVEL[g.level].hint}</span>
          </header>
          <ul className="flex flex-col gap-2">
            {sortByValue(g.items, ctx).map((n) => (
              <li key={n.id}>
                <NodeCard node={n} ctx={ctx} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function sortByValue(items: TreeNode[], ctx: Ctx) {
  return [...items].sort((a, b) => (ctx.values.get(b.id)?.value ?? -1) - (ctx.values.get(a.id)?.value ?? -1));
}

function NodeCard({ node: n, ctx, compact }: { node: TreeNode; ctx: Ctx; compact?: boolean }) {
  const v = ctx.values.get(n.id);
  const s = ctx.scope.get(n.id);
  const pre = ctx.prereqCount.get(n.id) ?? 0;
  const drift = n.suggested_level !== n.level && n.suggested_level !== "unknown";
  return (
    <a
      href={href.node(n.id)}
      className={cx(
        "flex flex-col gap-1.5 rounded-2xl border border-border-button-default bg-background-primary-default px-3 py-2.5 outline-none transition-colors",
        "hover:border-border-button-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        s?.action === "skip" && "opacity-60",
        compact && "h-full",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-body-medium text-text-primary"><MathText>{n.title}</MathText></span>
        <ValuePips value={v?.value ?? null} uncertainty={v?.uncertainty} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {compact ? <LevelChip level={n.level} size="sm" /> : null}
        <span className="text-caption-1-regular text-text-tertiary">{KIND[n.kind] ?? n.kind}</span>
        {pre && !compact ? <span className="text-caption-1-regular text-text-tertiary">· {pre} 个前置</span> : null}
        {s ? (
          <Chip variant="caption" color={ACTION[s.action].color} title={s.reason}>
            {ACTION[s.action].label}
          </Chip>
        ) : null}
        {drift && !compact ? (
          <span className="text-caption-1-regular text-text-tertiary" title="规则基线只看证据给出的机械判断">
            · 证据提示「{LEVEL[n.suggested_level as Level].label}」
          </span>
        ) : null}
      </div>
      {n.weak_point && !compact ? (
        <span className="text-caption-1-regular text-status-rose-text">卡在：<MathText>{n.weak_point}</MathText></span>
      ) : null}
    </a>
  );
}

// ---------- prerequisite graph ----------

const COL_W = 200;
const COL_GAP = 56;
const ROW_H = 76;
const ROW_GAP = 12;

function PrereqGraph({ nodes, edges, ctx }: { nodes: TreeNode[]; edges: CourseTree["edges"]; ctx: Ctx }) {
  const layout = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    const pre = edges.filter((e) => e.relation === "prerequisite_of" && ids.has(e.from_id) && ids.has(e.to_id));
    const parents = new Map<number, number[]>();
    for (const e of pre) parents.set(e.to_id, [...(parents.get(e.to_id) ?? []), e.from_id]);
    const depth = new Map<number, number>();
    const visiting = new Set<number>();
    const dfs = (id: number): number => {
      if (depth.has(id)) return depth.get(id)!;
      if (visiting.has(id)) return 0; // cycle guard
      visiting.add(id);
      const d = Math.max(-1, ...(parents.get(id) ?? []).map(dfs)) + 1;
      visiting.delete(id);
      depth.set(id, d);
      return d;
    };
    nodes.forEach((n) => dfs(n.id));
    const cols: TreeNode[][] = [];
    for (const n of nodes) (cols[depth.get(n.id)!] ??= []).push(n);
    const pos = new Map<number, { x: number; y: number }>();
    cols.forEach((col, c) => col.forEach((n, r) => pos.set(n.id, { x: c * (COL_W + COL_GAP), y: r * (ROW_H + ROW_GAP) })));
    const width = cols.length * (COL_W + COL_GAP) - COL_GAP;
    const height = Math.max(...cols.map((c) => c.length)) * (ROW_H + ROW_GAP) - ROW_GAP;
    return { cols, pos, pre, width, height };
  }, [nodes, edges]);

  if (!nodes.length) return <Empty>没有匹配的知识点</Empty>;

  return (
    <Card className="p-0">
      <div className="overflow-x-auto p-5">
        <div className="mb-3 flex gap-0" style={{ width: layout.width }}>
          {layout.cols.map((_, c) => (
            <span
              key={c}
              className="text-caption-1-medium text-text-tertiary"
              style={{ width: COL_W, marginInlineEnd: c < layout.cols.length - 1 ? COL_GAP : 0 }}
            >
              {c === 0 ? "基础（无前置）" : `第 ${c + 1} 层`}
            </span>
          ))}
        </div>
        <div className="relative" style={{ width: layout.width, height: layout.height }} dir="ltr">
          <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height} aria-hidden>
            {layout.pre.map((e) => {
              const a = layout.pos.get(e.from_id)!;
              const b = layout.pos.get(e.to_id)!;
              const x1 = a.x + COL_W, y1 = a.y + ROW_H / 2, x2 = b.x, y2 = b.y + ROW_H / 2;
              const mx = (x1 + x2) / 2;
              return (
                <path
                  key={`${e.from_id}-${e.to_id}`}
                  d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                  className="fill-none stroke-foreground-icon-quaternary"
                  strokeWidth={e.weight === 3 ? 2.5 : e.weight === 1 ? 1 : 1.5}
                  strokeDasharray={e.weight === 1 ? "4 4" : undefined}
                />
              );
            })}
          </svg>
          {nodes.map((n) => {
            const p = layout.pos.get(n.id)!;
            return (
              <div key={n.id} className="absolute" style={{ left: p.x, top: p.y, width: COL_W, height: ROW_H }}>
                <NodeCard node={n} ctx={ctx} compact />
              </div>
            );
          })}
        </div>
        {layout.pre.length === 0 ? (
          <p className="mt-4 text-caption-1-regular text-text-tertiary">还没有记录前置关系，AI 用 link_nodes 建立后会显示连线。</p>
        ) : (
          <p className="mt-4 text-caption-1-regular text-text-tertiary">粗线：必需前置；细线：重要；虚线：辅助。</p>
        )}
      </div>
    </Card>
  );
}

// ---------- links into other courses ----------

function ExternalPrereqs({ data }: { data: CourseTree }) {
  const ext = new Map((data.external_nodes ?? []).map((n) => [n.id, n]));
  const local = new Map(data.nodes.map((n) => [n.id, n]));
  const links = data.edges
    .filter((e) => (e.relation === "prerequisite_of" || e.relation === "analogous_to") && (ext.has(e.from_id) || ext.has(e.to_id)))
    .map((e) => ({ e, other: ext.get(e.from_id) ?? ext.get(e.to_id)!, mine: local.get(ext.has(e.from_id) ? e.to_id : e.from_id) }));
  if (!links.length) return null;
  return (
    <Card className="mt-4">
      <CardTitle>跨课程 / 跨学科链接</CardTitle>
      <ul className="flex flex-col gap-1">
        {links.map(({ e, other, mine }) => (
          <li key={`${e.from_id}-${e.to_id}-${e.relation}`} className="flex flex-wrap items-center gap-2 py-1 text-body-2-regular">
            <a href={href.node(other.id)} className="text-body-2-medium text-text-primary hover:underline">
              <MathText>{other.title}</MathText>
            </a>
            <span className="text-caption-1-regular text-text-tertiary">
              {other.course}
              {other.subject ? ` · ${other.subject}` : ""}
            </span>
            <LevelChip level={other.level} />
            <span className="text-caption-1-regular text-text-tertiary">
              {e.relation === "analogous_to"
                ? "类比"
                : ext.has(e.from_id)
                  ? `→ ${WEIGHT[e.weight ?? 2]}前置于`
                  : "← 以本课为前置"}
            </span>
            {mine ? (
              <a href={href.node(mine.id)} className="text-body-2-medium text-text-primary hover:underline">
                <MathText>{mine.title}</MathText>
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
