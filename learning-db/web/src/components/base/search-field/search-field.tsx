"use client";

import { useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { SearchField as AriaSearchField } from "react-aria-components";
import type { SearchFieldProps as AriaSearchFieldProps } from "react-aria-components";
import { RiSearchLine } from "@remixicon/react";
import { CloseButton } from "@/components/base/buttons/close-button";
import { HintText } from "@/components/base/input/hint-text";
import { InputBase } from "@/components/base/input/input";
import type { InputSize } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { SpinnerGlyph } from "@/components/base/spinner/spinner";
import { useTemplateCopy } from "@/components/foundations/template-copy/template-copy";
import { cx } from "@/utils/cx";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

export interface SearchFieldProps extends Omit<AriaSearchFieldProps, "className" | "children"> {
  label?: ReactNode;
  hint?: ReactNode;
  placeholder?: string;
  size?: InputSize;
  shape?: "pill" | "rounded";
  isLoading?: boolean;
  icon?: IconComponent;
  clearLabel?: string;
  className?: string;
  fieldClassName?: string;
}

export function SearchField({
  label,
  hint,
  placeholder,
  size = "medium",
  shape = "pill",
  isLoading = false,
  icon: Icon = RiSearchLine,
  clearLabel = "Clear search",
  value: controlledValue,
  defaultValue = "",
  onChange,
  onClear,
  "aria-label": ariaLabel,
  className,
  fieldClassName,
  ...props
}: SearchFieldProps) {
  const localize = useTemplateCopy();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const value = controlledValue ?? uncontrolledValue;

  const change = (next: string) => {
    setUncontrolledValue(next);
    onChange?.(next);
  };

  const clear = () => {
    change("");
    onClear?.();
    inputRef.current?.focus();
  };

  return (
    <AriaSearchField
      {...props}
      value={value}
      onChange={change}
      onClear={onClear}
      aria-label={ariaLabel ?? (!label ? placeholder : undefined)}
      className={cx("group flex w-full flex-col items-start gap-1", className)}
    >
      {({ isEmpty, isDisabled, isInvalid }) => (
        <>
          {label ? (
            <Label isRequired={props.isRequired} isInvalid={isInvalid}>
              {label}
            </Label>
          ) : null}
          <InputBase
            ref={inputRef}
            size={size}
            placeholder={placeholder}
            fieldClassName={cx(shape === "pill" && "rounded-full", fieldClassName)}
            className="[&::-webkit-search-cancel-button]:hidden"
            leadingAddon={
              <span aria-hidden className="relative ms-1 size-5 shrink-0">
                <Icon
                  className={cx(
                    "absolute inset-0 size-5 transition-[opacity,scale] duration-200 ease-out",
                    isLoading && "scale-75 opacity-0",
                  )}
                />
                <span
                  className={cx(
                    "absolute inset-0 flex items-center justify-center transition-[opacity,scale] duration-200 ease-out",
                    !isLoading && "scale-75 opacity-0 [&_*]:[animation-play-state:paused]",
                  )}
                >
                  <SpinnerGlyph size="sm" />
                </span>
              </span>
            }
            trailingAddon={
              <CloseButton
                size="2xs"
                aria-label={localize(clearLabel)}
                aria-hidden={isEmpty || undefined}
                tabIndex={-1}
                disabled={isDisabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={clear}
                className={cx(
                  "me-0.5 bg-background-tertiary-hover transition-[opacity,scale,color] duration-150 ease-out",
                  isEmpty || isDisabled ? "pointer-events-none scale-50 opacity-0" : "scale-100 opacity-100",
                )}
              />
            }
          />
          {hint ? <HintText isInvalid={isInvalid}>{hint}</HintText> : null}
        </>
      )}
    </AriaSearchField>
  );
}
