import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/8bit/avatar"
import "@/components/ui/8bit/styles/retro.css";

// 7x6 pixel-art heart mask, 1 = filled pixel
const HEART_PIXELS = [
  [0, 1, 1, 0, 1, 1, 0],
  [1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 1, 0, 0],
  [0, 0, 0, 1, 0, 0, 0],
];

interface PixelHeartProps {
  filled: boolean;
  size?: number;
}

function PixelHeart({ filled, size = 4 }: PixelHeartProps) {
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

interface HealthBarProps {
  className?: string;
  teamHref?: string;
  hearts?: number;
  filledHearts?: number;
  totalPoints?: number;
  heartSize?: number;
}

export default function HealthBar({
  className,
  teamHref = "/team",
  hearts = 5,
  filledHearts = 5,
  totalPoints = 0,
  heartSize = 3,
}: HealthBarProps) {
  return (
    <div className={cn("flex w-full flex-row items-start gap-2", className)}>
      <Link to={teamHref} aria-label="View team">
        <Avatar>
          <AvatarImage src="https://8bitcn.com/images/pixelized-8bitcnorc.jpg" alt="@8bitcn" />
          <AvatarFallback>CN</AvatarFallback>
        </Avatar>
      </Link>
      <div className="h-11 flex flex-col justify-center gap-1">
        <div className="flex items-center gap-2">
          {Array.from({ length: hearts }, (_, index) => (
            <PixelHeart
              key={index}
              filled={index < filledHearts}
              size={heartSize}
            />
          ))}
        </div>

        <div className="flex w-full items-center justify-start gap-2">
          <span className="retro text-[10px] tracking-tight">
            {totalPoints.toLocaleString()} PTS
          </span>
        </div>
      </div>
    </div>
  );
}
