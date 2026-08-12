import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import "@/components/ui/8bit/styles/retro.css";

interface CountdownProps {
  className?: string;
  onComplete?: () => void;
  seconds?: number;
}

export default function Countdown({ className, onComplete, seconds = 5 }: CountdownProps) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      onComplete?.();
      return;
    }
    const timeout = setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => clearTimeout(timeout);
  }, [remaining, onComplete]);

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-8 text-center",
        className,
      )}
    >
      <p className="retro text-xs tracking-tight text-muted-foreground md:text-sm">
        THE HUNT BEGINS IN
      </p>
      <span
        key={remaining}
        className="retro animate-pulse text-6xl leading-none font-bold md:text-8xl"
      >
        {remaining > 0 ? remaining : "GO!"}
      </span>
    </div>
  );
}
