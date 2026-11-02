// Small app-level pieces composed from BoardUI primitives and tokens.
import type { ReactNode } from "react";
import { Chip } from "@/components/base/badges/chip";
import { Skeleton } from "@/components/base/skeleton/skeleton";
import { Button } from "@/components/base/buttons/button";
import { RiErrorWarningLine } from "@remixicon/react";
import type { ApiError, Level } from "@/lib/api";
import { LEVEL, VALUE_LABEL, UNCERTAINTY } from "@/lib/labels";
import { cx } from "@/utils/cx";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cx(
        "rounded-3xl border border-border-button-default bg-background-primary-default p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-headline-semibold text-text-primary">{children}</h2>
      {extra}
    </div>
  );
}

export function LevelChip({ level, size = "md" }: { level: Level; size?: "sm" | "md" }) {
  const l = LEVEL[level] ?? LEVEL.unknown;
  return (
    <Chip
      color={l.color}
      variant={size === "sm" ? "caption" : "subtle"}
      title={l.hint}
      className="cursor-default"
    >
      {l.label}
    </Chip>
  );
}

/** Exam value as three pips; empty value means "no data yet". */
export function ValuePips({ value, uncertainty }: { value: number | null; uncertainty?: string }) {
  const label =
    value === null ? "暂无依据" : `考核价值：${VALUE_LABEL[value]}${uncertainty ? `（${UNCERTAINTY[uncertainty]}）` : ""}`;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={label} title={label}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cx(
            "size-1.5 rounded-full",
            value !== null && i <= value
              ? uncertainty === "high"
                ? "bg-accent-300"
                : "bg-accent-500"
              : "bg-background-tertiary-default",
          )}
        />
      ))}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption-1-medium text-text-tertiary">{label}</dt>
      <dd className="text-body-regular whitespace-pre-wrap text-text-primary">{children}</dd>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-body-2-regular text-text-tertiary">{children}</p>;
}

export function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full rounded-3xl" />
      <Skeleton className="h-64 w-full rounded-3xl" />
    </div>
  );
}

export function ErrorCard({ error }: { error: ApiError }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <RiErrorWarningLine className="size-6 text-foreground-icon-error" aria-hidden />
      <p className="text-body-medium text-text-primary">
        {error.status === 404 ? "没有找到这条记录" : "加载失败"}
      </p>
      <p className="text-caption-1-regular text-text-tertiary">{error.message}</p>
      <Button variant="secondary" size="small" onClick={() => window.location.reload()}>
        重试
      </Button>
    </Card>
  );
}

export function PageHeader({ title, sub, extra }: { title: ReactNode; sub?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-title-2-semibold text-text-primary">{title}</h1>
        {sub ? <div className="text-body-2-regular text-text-secondary">{sub}</div> : null}
      </div>
      {extra}
    </div>
  );
}
