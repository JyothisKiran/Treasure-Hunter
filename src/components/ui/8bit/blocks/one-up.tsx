import { cn } from "@/lib/utils";

import "@/components/ui/8bit/styles/retro.css";

// 7x6 pixel-art mushroom mask: 0 transparent, 1 cap, 2 spot, 3 stem
const MUSHROOM_PIXELS = [
  [0, 0, 1, 1, 1, 0, 0],
  [0, 1, 2, 1, 2, 1, 0],
  [1, 1, 1, 1, 1, 1, 1],
  [1, 2, 1, 1, 1, 2, 1],
  [0, 0, 3, 3, 3, 0, 0],
  [0, 0, 3, 3, 3, 0, 0],
];

export interface OneUpProps {
  className?: string;
  count: number;
  size?: number;
}

export function OneUp({ className, count, size = 3 }: OneUpProps) {
  if (count <= 0) return null;

  return (
    <div
      className={cn("flex items-center gap-1 animate-bounce", className)}
      role="status"
      aria-label={`${count} extra ${count === 1 ? "life" : "lives"}`}
    >
      <div
        className="pixelated grid shrink-0"
        style={{
          gridTemplateColumns: `repeat(7, ${size}px)`,
          gridTemplateRows: `repeat(6, ${size}px)`,
        }}
      >
        {MUSHROOM_PIXELS.flatMap((row, rowIndex) =>
          row.map((pixel, colIndex) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              className={cn(
                pixel === 1 && "bg-green-500 dark:bg-green-600",
                pixel === 2 && "bg-white",
                pixel === 3 && "bg-amber-200 dark:bg-amber-300",
                pixel === 0 && "bg-transparent",
              )}
            />
          )),
        )}
      </div>
      <span className="retro text-[10px] font-bold tracking-tight text-green-600 dark:text-green-400">
        +{count}UP
      </span>
    </div>
  );
}
