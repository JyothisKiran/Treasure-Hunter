import { Link } from "react-router-dom";
import { Swords } from "lucide-react";

import { cn } from "@/lib/utils";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/8bit/avatar"
import { Badge } from "@/components/ui/8bit/badge";
import { Button } from "@/components/ui/8bit/button";
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
  attackHref?: string;
  hearts?: number;
  filledHearts?: number;
  totalPoints?: number;
  heartSize?: number;
  attackPoints?: number;
}

export default function HealthBar({
  className,
  teamHref = "/team",
  attackHref = "/attack",
  hearts = 5,
  filledHearts = 5,
  totalPoints = 0,
  heartSize = 3,
  attackPoints = 0,
}: HealthBarProps) {
  return (
    <div className={cn("flex w-full flex-row items-start justify-between gap-4", className)}>
      <div className="flex flex-row items-start gap-2">
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

      <div className="relative shrink-0">
        <Button asChild size="icon" variant="outline" className="size-11">
          <Link
            to={attackHref}
            aria-label={`Attack another team, ${attackPoints} attack points left`}
          >
            <Swords className="size-5" />
          </Link>
        </Button>
        {attackPoints > 0 && (
          <Badge
            aria-hidden="true"
            className="absolute -top-2 -right-2 h-5 bg-red-500 px-1 text-[10px] leading-none text-white dark:bg-red-600"
          >
            {attackPoints > 99 ? "99+" : attackPoints}
          </Badge>
        )}
      </div>
    </div>
  );
}
