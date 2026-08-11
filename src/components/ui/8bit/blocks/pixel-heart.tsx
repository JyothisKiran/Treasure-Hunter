import { cn } from "@/lib/utils";

// 7x6 pixel-art heart mask, 1 = filled pixel
const HEART_PIXELS = [
  [0, 1, 1, 0, 1, 1, 0],
  [1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 1, 0, 0],
  [0, 0, 0, 1, 0, 0, 0],
];

export interface PixelHeartProps {
  filled: boolean;
  size?: number;
}

export function PixelHeart({ filled, size = 4 }: PixelHeartProps) {
  return (
    <div
      className="pixelated grid shrink-0"
      style={{
        gridTemplateColumns: `repeat(7, ${size}px)`,
        gridTemplateRows: `repeat(6, ${size}px)`,
      }}
    >
      {HEART_PIXELS.flatMap((row, rowIndex) =>
        row.map((pixel, colIndex) => (
          <div
            key={`${rowIndex}-${colIndex}`}
            className={cn(
              pixel
                ? filled
                  ? "bg-red-500 dark:bg-red-600"
                  : "bg-muted-foreground/25"
                : "bg-transparent",
            )}
          />
        )),
      )}
    </div>
  );
}

export interface HeartRowProps {
  hearts?: number;
  filledHearts?: number;
  heartSize?: number;
  className?: string;
}

export function HeartRow({
  hearts = 5,
  filledHearts = 5,
  heartSize = 3,
  className,
}: HeartRowProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {Array.from({ length: hearts }, (_, index) => (
        <PixelHeart key={index} filled={index < filledHearts} size={heartSize} />
      ))}
    </div>
  );
}
