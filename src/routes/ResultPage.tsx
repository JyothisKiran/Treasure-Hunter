import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Swords } from "lucide-react";

import { Button } from "@/components/ui/8bit/button";
import { PixelHeart } from "@/components/ui/8bit/blocks/pixel-heart";
import { toast } from "@/components/ui/8bit/toast";
import { useScanQr } from "@/hooks/mutations/useScanQr";

const ResultPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");
  const qrScanMutation = useScanQr();
  const submittedCode = useRef<string | null>(null);

  useEffect(() => {
    if (code && submittedCode.current !== code) {
      submittedCode.current = code;
      qrScanMutation.mutate(code);
    }
  }, [code, qrScanMutation]);

  if (!code) return <p className="retro text-center text-xs text-destructive">No scan code was provided.</p>;
  if (qrScanMutation.isPending) return <p className="retro flex min-h-dvh items-center justify-center text-center text-xs">Submitting scan...</p>;
  if (qrScanMutation.isError) return <p className="retro flex min-h-dvh items-center justify-center text-center text-xs text-destructive">Unable to submit scan. Please try again.</p>;

  const result = qrScanMutation.data?.data;
  const detail = result?.detail ?? "Scan processed";
  const normalizedDetail = detail.toLowerCase();
  const started = normalizedDetail.includes("game started");
  const correct = normalizedDetail.includes("correct") && !normalizedDetail.includes("incorrect");
  const score = result?.data?.score ?? result?.score;
  const bonus = result?.data?.bonus ?? result?.bonus;
  const hasBonus = bonus !== undefined && bonus !== 0;
  const totalPoints = (score ?? 0) + (bonus ?? 0);
  const attack = result?.attack ?? 0;
  const life = result?.life ?? 0;

  if (!result) return <p className="retro flex min-h-dvh items-center justify-center text-center text-xs text-destructive">The server returned an empty response.</p>;

  return (
    <div className="retro flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="retro text-2xl">{started ? "GAME STARTED!" : correct ? "CORRECT!" : "INCORRECT"}</h1>
      <p className="retro text-sm text-muted-foreground">{detail}</p>
      {(score !== undefined || bonus !== undefined) && (
        <div className="text-lg">
          {hasBonus ? (
            <div className="flex flex-col gap-2"> 
              <span>{`${totalPoints > 0 ? "+" : ""}${totalPoints} XP `}</span>
              <span className="text-amber-400">{`(+ BONUS: ${bonus})`}</span>
                {(life > 0 || attack > 0) && (
                  <div className="flex flex-col gap-2 items-center">
                    {life > 0 && (
                      <span className="flex items-center gap-2 text-red-400">
                        <PixelHeart filled size={4} />
                        +{life} LIFE
                      </span>
                    )}
                    {attack > 0 && (
                      <span className="flex items-center gap-2 text-foreground">
                        <Swords className="size-5" aria-hidden="true" />
                        +{attack} ATTACK
                      </span>
                    )}
                  </div>
                )}
            </div>
          ) : (
            score !== undefined && `${score > 0 ? "+" : ""}${score} XP`
          )}
        </div>
      )}
      <Button className="mt-3" onClick={() => { toast("Loading current node..."); navigate(`/detail?from=${encodeURIComponent(code)}`); }}>CONTINUE</Button>
    </div>
  );
};

export default ResultPage;
