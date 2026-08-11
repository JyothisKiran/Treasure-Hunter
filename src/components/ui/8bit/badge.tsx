import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

import { Badge as ShadcnBadge } from "@/components/ui/badge";

import "@/components/ui/8bit/styles/retro.css";

export const badgeVariants = cva("", {
  variants: {
    font: {
      normal: "",
      retro: "retro",
    },
  },
  defaultVariants: {
    font: "retro",
  },
});

export interface BitBadgeProps
  extends React.ComponentProps<typeof ShadcnBadge>,
    VariantProps<typeof badgeVariants> {}

function BadgeDecorations() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none contents"
      data-slot="badge-decorations"
    >
      <span className="absolute top-0 left-0 h-1 w-full bg-foreground dark:bg-ring" />
      <span className="absolute bottom-0 left-0 h-1 w-full bg-foreground dark:bg-ring" />
      <span className="absolute top-0.5 -left-1 h-[calc(100%-4px)] w-1 bg-foreground dark:bg-ring" />
      <span className="absolute top-0.5 -right-1 h-[calc(100%-4px)] w-1 bg-foreground dark:bg-ring" />
    </span>
  );
}

function Badge({ className, font, children, ...props }: BitBadgeProps) {
  return (
    <ShadcnBadge
      {...props}
      className={cn(
        "relative min-w-5 justify-center rounded-none border-none px-1",
        font !== "normal" && "retro",
        className
      )}
    >
      {children}
      <BadgeDecorations />
    </ShadcnBadge>
  );
}

export { Badge };
