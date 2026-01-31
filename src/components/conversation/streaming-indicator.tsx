"use client";

import { cn } from "@/lib/utils";

type StreamingIndicatorProps = {
  label?: string;
  className?: string;
};

export function StreamingIndicator({
  label = "Streaming",
  className,
}: StreamingIndicatorProps): React.ReactElement {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs font-medium text-emerald-300",
        className
      )}
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      {label ? <span>{label}</span> : null}
    </span>
  );
}
