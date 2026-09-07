import { type VariantProps, cva } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes, Ref } from "react";

import { Button as ShadcnButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import "@/components/ui/8bit/styles/retro.css";

export const buttonVariants = cva("", {
  variants: {
    font: {
      normal: "",
      retro: "retro",
    },
    variant: {
      default: "bg-foreground",
      destructive: "bg-foreground",
      outline: "bg-foreground",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      ghost: "hover:bg-accent hover:text-accent-foreground",
      link: "text-primary underline-offset-4 hover:underline",
    },
    size: {
      default: "",
      sm: "",
      lg: "",
      icon: "",
      compact: "",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export interface BitButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

interface ButtonDecorationsProps {
  size: BitButtonProps["size"];
  variant: BitButtonProps["variant"];
}

function ButtonDecorations({ size, variant }: ButtonDecorationsProps) {
  const isCompact = size === "compact";

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none contents"
      data-slot="button-decorations"
    >
      {variant !== "ghost" && variant !== "link" && size !== "icon" && (
        <>
          {/* Pixelated border */}
          <span className={cn("absolute bg-foreground dark:bg-ring", isCompact ? "-top-1 left-1 h-1 w-1/2" : "-top-1.5 left-1.5 h-1.5 w-1/2")} />
          <span className={cn("absolute bg-foreground dark:bg-ring", isCompact ? "-top-1 right-1 h-1 w-1/2" : "-top-1.5 right-1.5 h-1.5 w-1/2")} />
          <span className={cn("absolute bg-foreground dark:bg-ring", isCompact ? "-bottom-1 left-1 h-1 w-1/2" : "-bottom-1.5 left-1.5 h-1.5 w-1/2")} />
          <span className={cn("absolute bg-foreground dark:bg-ring", isCompact ? "-bottom-1 right-1 h-1 w-1/2" : "-bottom-1.5 right-1.5 h-1.5 w-1/2")} />
          <span className={cn("absolute bg-foreground dark:bg-ring", isCompact ? "top-0 left-0 size-1" : "top-0 left-0 size-1.5")} />
          <span className={cn("absolute bg-foreground dark:bg-ring", isCompact ? "top-0 right-0 size-1" : "top-0 right-0 size-1.5")} />
          <span className={cn("absolute bg-foreground dark:bg-ring", isCompact ? "bottom-0 left-0 size-1" : "bottom-0 left-0 size-1.5")} />
          <span className={cn("absolute bg-foreground dark:bg-ring", isCompact ? "right-0 bottom-0 size-1" : "right-0 bottom-0 size-1.5")} />
          <span className={cn("absolute bg-foreground dark:bg-ring", isCompact ? "top-1 -left-1 h-[calc(100%-8px)] w-1" : "top-1.5 -left-1.5 h-[calc(100%-12px)] w-1.5")} />
          <span className={cn("absolute bg-foreground dark:bg-ring", isCompact ? "top-1 -right-1 h-[calc(100%-8px)] w-1" : "top-1.5 -right-1.5 h-[calc(100%-12px)] w-1.5")} />
          {variant !== "outline" && (
            <>
              {/* Top shadow */}
              <span className={cn("absolute top-0 left-0 w-full bg-foreground/20", isCompact ? "h-1" : "h-1.5")} />
              <span className={cn("absolute left-0 bg-foreground/20", isCompact ? "top-1 h-1 w-2" : "top-1.5 h-1.5 w-3")} />

              {/* Bottom shadow */}
              <span className={cn("absolute bottom-0 left-0 w-full bg-foreground/20", isCompact ? "h-1" : "h-1.5")} />
              <span className={cn("absolute right-0 bg-foreground/20", isCompact ? "bottom-1 h-1 w-2" : "bottom-1.5 h-1.5 w-3")} />
            </>
          )}
        </>
      )}

      {size === "icon" && (
        <>
          <span className="absolute top-0 left-0 h-[5px] w-full bg-foreground md:h-1.5 dark:bg-ring" />
          <span className="absolute bottom-0 h-[5px] w-full bg-foreground md:h-1.5 dark:bg-ring" />
          <span className="absolute top-1 -left-1 h-1/2 w-[5px] bg-foreground md:w-1.5 dark:bg-ring" />
          <span className="absolute bottom-1 -left-1 h-1/2 w-[5px] bg-foreground md:w-1.5 dark:bg-ring" />
          <span className="absolute top-1 -right-1 h-1/2 w-[5px] bg-foreground md:w-1.5 dark:bg-ring" />
          <span className="absolute -right-1 bottom-1 h-1/2 w-[5px] bg-foreground md:w-1.5 dark:bg-ring" />
        </>
      )}
    </span>
  );
}

function Button({
  asChild = false,
  children,
  className,
  font,
  size,
  variant,
  ...props
}: BitButtonProps) {
  const decorations = <ButtonDecorations size={size} variant={variant} />;

  return (
    <ShadcnButton
      {...props}
      className={cn(
        "relative inline-flex min-h-11 items-center justify-center gap-1.5 rounded-none border-none px-4 py-2 transition-transform active:translate-y-1",
        size === "compact" && "min-h-9 gap-1 px-3 py-1 text-[10px]",
        size === "icon" && "mx-1 my-0",
        font !== "normal" && "retro",
        className
      )}
      size={size === "compact" ? "sm" : size}
      variant={variant}
    >
      {asChild ? <Slot>{children}</Slot> : children}
      {decorations}
    </ShadcnButton>
  );
}

export { Button };
