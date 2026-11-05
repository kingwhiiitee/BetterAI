"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

// React Aria's isNonModal (used to avoid the modal scroll lock / focus trap) also disables
// close-on-outside-press. This restores only that.
export function useDismissOnOutsidePress(
  isOpen: boolean,
  onDismiss: () => void,
  refs: RefObject<HTMLElement | null>[],
) {
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      onDismiss();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isOpen, onDismiss, refs]);
}

// Same isNonModal popovers: pressing the trigger while open fires onOpenChange(false) then (true) in one
// press, so it never closes. Gate onOpenChange with the returned guard to swallow the spurious reopen.
export function useTriggerToggle(
  isOpen: boolean,
  triggerRef: RefObject<HTMLElement | null>,
) {
  const suppressReopenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node)) return;
      suppressReopenRef.current = true;
      setTimeout(() => {
        suppressReopenRef.current = false;
      }, 400);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isOpen, triggerRef]);

  return (next: boolean) => {
    if (next && suppressReopenRef.current) {
      suppressReopenRef.current = false;
      return false;
    }
    return true;
  };
}
