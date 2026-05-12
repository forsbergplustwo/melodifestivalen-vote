"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  valueDisplay?: React.ReactNode;
  /** Larger touch targets for mobile “cockpit” voting */
  size?: "default" | "large";
  /** Fires on commit-style change (pointer up) for haptic-style UI */
  onValueCommit?: (value: number) => void;
  className?: string;
}

export function Slider({
  value,
  min = 1,
  max = 10,
  step = 1,
  onChange,
  label,
  valueDisplay,
  size = "default",
  onValueCommit,
  className,
}: SliderProps) {
  const isLarge = size === "large";
  const trackClass = isLarge ? "slider-track slider-track--lg" : "slider-track";
  const rangeClass = isLarge ? "slider-range slider-range--lg" : "slider-range";
  const thumbClass = isLarge ? "slider-thumb slider-thumb--lg" : "slider-thumb";
  const spacingClass = label ? (isLarge ? "mb-4" : "mb-3") : "";

  return (
    <div className={`${spacingClass} ${className ?? ""}`}>
      {label ? (
        <label className={`mb-2 block font-semibold ${isLarge ? "text-base" : "text-sm"}`}>
          {label}: {valueDisplay}
        </label>
      ) : null}
      <SliderPrimitive.Root
        className="relative flex w-full touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(values) => onChange(values[0])}
        onValueCommit={(values) => onValueCommit?.(values[0])}
        aria-label={label || "Slider"}
      >
        <SliderPrimitive.Track className={`${trackClass} relative w-full grow rounded-full`}>
          <SliderPrimitive.Range className={`${rangeClass} absolute h-full rounded-full`} />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className={`${thumbClass} block`} />
      </SliderPrimitive.Root>
    </div>
  );
}
