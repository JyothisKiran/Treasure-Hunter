import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

import { Input as ShadcnInput } from "@/components/ui/input";

import "@/components/ui/8bit/styles/retro.css";

export const inputVariants = cva("", {
  variants: {
    font: {
      normal: "",
      retro: "retro",
    },
    size: {
      default: "",
      compact: "",
    },
  },
  defaultVariants: {
    font: "retro",
  },
});

export interface BitInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {
  asChild?: boolean;
}

function Input({ ...props }: BitInputProps) {
  const { className, font, size = "default", ...inputProps } = props;
  const isCompact = size === "compact";

  return (
    <div
      className={cn(
        "relative flex items-center border-foreground dark:border-ring !p-0",
        isCompact ? "border-y-4" : "border-y-6",
        className
      )}
    >
      <ShadcnInput
        {...inputProps}
        className={cn(
          "rounded-none ring-0 !w-full",
          isCompact ? "min-h-9" : "min-h-11",
          font !== "normal" && "retro",
          className
        )}
      />

      <div
        className={cn(
          "pointer-events-none absolute inset-0 border-foreground dark:border-ring",
          isCompact ? "-mx-1 border-x-4" : "-mx-1.5 border-x-6",
        )}
        aria-hidden="true"
      />
    </div>
  );
}

export { Input };
