import type { KeyboardEvent, PointerEvent } from "react";
import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN } from "@/lib/sidebar-width";

const STEP = 10;

function keyDelta(key: string): number | null {
  if (key === "ArrowLeft") return -STEP;
  if (key === "ArrowRight") return STEP;
  return null;
}

/** Drag handle on the sidebar's end edge; the sidebar's left edge is the page's, so clientX is the width. */
export function ResizeHandle({ width, onResize }: { width: number; onResize: (w: number) => void }) {
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) onResize(e.clientX);
  };
  const onPointerUp = () => {
    document.body.style.cursor = "";
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = keyDelta(e.key);
    if (d === null) return;
    e.preventDefault();
    onResize(width + d);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="调整侧边栏宽度"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onResize(SIDEBAR_DEFAULT)}
      title="拖动调整宽度，双击恢复默认"
      className="absolute inset-y-0 -end-1 z-30 hidden w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:start-1/2 after:w-px after:-translate-x-1/2 after:transition-colors hover:after:bg-border-focus-ring focus-visible:after:bg-border-focus-ring md:block"
    />
  );
}
