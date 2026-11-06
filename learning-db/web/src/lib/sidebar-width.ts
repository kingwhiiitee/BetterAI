import { useCallback, useEffect, useState } from "react";

export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 300;
export const SIDEBAR_DEFAULT = 260;
const KEY = "coach:sidebar-width";

export function clampWidth(w: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)));
}

function readWidth(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v ? clampWidth(v) : SIDEBAR_DEFAULT;
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

function saveWidth(w: number) {
  try {
    localStorage.setItem(KEY, String(w));
  } catch {
    // storage blocked (private mode): width just won't persist
  }
}

export function useSidebarWidth() {
  const [width, setWidth] = useState(readWidth);
  useEffect(() => saveWidth(width), [width]);
  const set = useCallback((w: number) => setWidth(clampWidth(w)), []);
  return [width, set] as const;
}
