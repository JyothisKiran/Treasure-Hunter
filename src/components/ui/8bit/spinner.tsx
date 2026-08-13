import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type SpinnerProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "classic" | "diamond";
};

/** 8-bitCN-style loading spinner. */
function Spinner({ className, variant = "classic", ...props }: SpinnerProps) {
  if (variant === "diamond") {
    return (
      <span
        aria-label="Loading"
        aria-live="polite"
        className={cn("relative inline-block size-4 animate-spin", className)}
        role="status"
        {...props}
      >
        <span className="absolute inset-[25%] rotate-45 border-2 border-current" />
        <span className="absolute inset-0 rotate-45 border border-current/40" />
      </span>
    );
  }

  return (
    <span
      aria-label="Loading"
      aria-live="polite"
      className={cn("inline-block size-4 animate-spin border-2 border-current border-t-transparent", className)}
      role="status"
      {...props}
    />
  );
}

export { Spinner };
