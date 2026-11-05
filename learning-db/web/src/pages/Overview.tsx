import { RiArrowRightSLine, RiCalendarLine } from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import { useApi, type Course, type Overview as OverviewData } from "@/lib/api";
import { LEVEL, LEVELS, COURSE_STATUS, ASSESSMENT_STATUS, daysUntil, fmtTime } from "@/lib/labels";
import { MathText } from "@/components/math-text";
import { href } from "@/lib/router";
import { Card, CardTitle, Empty, ErrorCard, Loading, PageHeader } from "@/components/ui";
import { DecisionList } from "./Decisions";

export function OverviewPage() {
  const { data, error, loading } = useApi<OverviewData>("/overview");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorCard error={error!} />;

  return (
    <>
      <PageHeader title="知识库" />
      {data.courses.length === 0 ? (
        <Card>
          <Empty>还没有课程。和 AI 学习时，它会通过 MCP 工具自动建课、建节点。</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardTitle
            extra={
              <a href={href.decisions} className="text-caption-1-medium text-text-tertiary hover:text-text-secondary">
                全部
              </a>
            }
          >
            下一步
          </CardTitle>
          <DecisionList decisions={data.open_decisions.slice(0, 6)} compact />
        </Card>
        <Card>
          <CardTitle>最近学习</CardTitle>
          {data.last_sessions.length === 0 ? (
            <Empty>还没有学习记录</Empty>
          ) : (
            <ol className="flex flex-col gap-4">
              {data.last_sessions.map((s) => (
                <li key={s.id} className="flex flex-col gap-1 border-s-2 border-separator-border ps-3">
                  <span className="text-caption-1-medium text-text-tertiary">
                    {fmtTime(s.started_at)}
                    {s.planned_min ? ` · 计划 ${s.planned_min} 分钟` : ""}
                    {s.goal ? ` · ${s.goal}` : ""}
                  </span>
                  <span className="text-body-2-regular text-text-primary">{s.summary ? <MathText>{s.summary}</MathText> : "（未写总结）"}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}

function CourseCard({ course: c }: { course: Course }) {
  const total = Math.max(c.node_count, 1);
  const upcoming = c.assessments.filter((a) => a.status === "upcoming");
  return (
    <a
      href={href.course(c.id)}
      className="group flex flex-col gap-4 rounded-3xl border border-border-button-default bg-background-primary-default p-5 outline-none transition-colors hover:border-border-button-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-headline-semibold text-text-primary">{c.name}</span>
          <span className="text-caption-1-regular text-text-tertiary">{c.node_count} 个知识点</span>
        </div>
        <div className="flex items-center gap-1">
          {c.status !== "active" ? (
            <Chip variant="caption" color="neutral">
              {COURSE_STATUS[c.status]}
            </Chip>
          ) : null}
          <RiArrowRightSLine className="size-5 text-foreground-icon-tertiary transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>

      {/* state distribution bar */}
      <div className="flex flex-col gap-2">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-background-tertiary-default">
          {LEVELS.map((l) =>
            c.levels[l] ? (
              <span
                key={l}
                className={`h-full ${LEVEL_BAR[l]}`}
                style={{ width: `${((c.levels[l] ?? 0) / total) * 100}%` }}
                title={`${LEVEL[l].label} ${c.levels[l]}`}
              />
            ) : null,
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {LEVELS.filter((l) => c.levels[l]).map((l) => (
            <span key={l} className="inline-flex items-center gap-1.5 text-caption-1-regular text-text-secondary">
              <span className={`size-2 rounded-full ${LEVEL_BAR[l]}`} />
              {LEVEL[l].label} {c.levels[l]}
            </span>
          ))}
        </div>
      </div>

      {c.assessments.length ? (
        <div className="flex flex-wrap gap-2">
          {c.assessments.map((a) => {
            const d = daysUntil(a.exam_date);
            return (
              <span
                key={a.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-background-secondary-default px-2.5 py-1 text-caption-1-medium text-text-secondary"
              >
                <RiCalendarLine className="size-3.5" aria-hidden />
                {a.name}
                {a.status !== "upcoming"
                  ? ` · ${ASSESSMENT_STATUS[a.status]}`
                  : d !== null
                    ? d >= 0
                      ? ` · 还有 ${d} 天`
                      : ` · ${a.exam_date}`
                    : ""}
              </span>
            );
          })}
        </div>
      ) : upcoming.length === 0 ? (
        <span className="text-caption-1-regular text-text-tertiary">还没有设定考核目标</span>
      ) : null}
    </a>
  );
}

/** Solid fills per state for bars and dots, drawn from the chip palette tokens. */
export const LEVEL_BAR: Record<string, string> = {
  unknown: "bg-text-tertiary/40",
  exposed: "bg-status-cyan-text",
  assisted: "bg-status-yellow-text",
  independent: "bg-status-blue-text",
  validated: "bg-status-lime-text",
  weak: "bg-status-rose-text",
  recheck: "bg-status-orange-text",
};
