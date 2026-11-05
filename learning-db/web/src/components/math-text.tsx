import { memo, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { cx } from "@/utils/cx";

type Part = { math: false; text: string } | { math: true; tex: string; display: boolean };

// $$...$$, \[...\], \(...\), and $...$ with guards so prices like "$5 and $10" stay text.
// KaTeX and its fonts are bundled; the viewer must not depend on a CDN.
const PATTERN = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$\w])\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$(?!\d)/g;

export function splitMath(src: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of src.matchAll(PATTERN)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ math: false, text: src.slice(last, i) });
    const display = m[1] !== undefined || m[2] !== undefined;
    parts.push({ math: true, tex: (m[1] ?? m[2] ?? m[3] ?? m[4]).trim(), display });
    last = i + m[0].length;
  }
  if (last < src.length) parts.push({ math: false, text: src.slice(last) });
  return parts;
}

function render(tex: string, display: boolean): string {
  return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore", output: "html" });
}

export const MathText = memo(function MathText({
  children,
  className,
}: {
  children: string | null | undefined;
  className?: string;
}) {
  const parts = useMemo(() => (children ? splitMath(children) : []), [children]);
  if (!children) return null;
  if (!parts.some((p) => p.math)) return <span className={className}>{children}</span>;
  return (
    <span className={cx("math-text", className)}>
      {parts.map((p, i) =>
        p.math ? (
          <span
            key={i}
            className={p.display ? "block overflow-x-auto overflow-y-hidden py-1" : undefined}
            dangerouslySetInnerHTML={{ __html: render(p.tex, p.display) }}
          />
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
});
