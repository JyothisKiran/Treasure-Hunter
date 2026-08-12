import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Crown, Swords, Users } from "lucide-react";

import { Button } from "@/components/ui/8bit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { PixelHeart } from "@/components/ui/8bit/blocks/pixel-heart";
import { toast } from "@/components/ui/8bit/toast";
import { useScanQr } from "@/hooks/mutations/useScanQr";
import type { WinningTeam } from "@/types/detail";

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

  const resultPayload = qrScanMutation.data?.data;
  const isStringResult = typeof resultPayload === "string";
  const result = isStringResult ? undefined : resultPayload;
  const detail = isStringResult ? "Better Luck Next Time" : result?.detail ?? "Better Luck Next Time";
  const normalizedDetail = detail.toLowerCase();
  const isWinner = normalizedDetail.includes("you win") || normalizedDetail === "win" || normalizedDetail.includes("winner");
  const winningTeam = !isStringResult && isWinner && result?.data && "name" in result.data
    ? result.data as WinningTeam
    : undefined;
  const currentNode = !isStringResult && result?.data && "effects" in result.data
    ? result.data
    : undefined;
  const started = normalizedDetail.includes("game started");
  const correct = normalizedDetail.includes("correct") && !normalizedDetail.includes("incorrect");
  const incorrect = normalizedDetail.includes("incorrect") || normalizedDetail.includes("wrong");
  const isJunction = currentNode?.effects === "JUNCTION";
  const score = winningTeam?.score ?? currentNode?.score ?? result?.score;
  const bonus = currentNode?.bonus ?? result?.bonus;
  const hasBonus = bonus !== undefined && bonus !== 0;
  const totalPoints = (score ?? 0) + (bonus ?? 0);
  const attack = winningTeam?.attack ?? result?.attack ?? 0;
  const life = winningTeam?.life ?? result?.life ?? 0;
  const continuePath = isWinner
    ? "/landing"
    : isStringResult
    ? "/detail"
    : incorrect || isJunction
      ? "/landing"
      : `/detail?from=${encodeURIComponent(code)}`;

  if (resultPayload === undefined || resultPayload === null) {
    return <p className="retro flex min-h-dvh items-center justify-center text-center text-xs text-destructive">The server returned an empty response.</p>;
  }

  if (isWinner && winningTeam) {
    return (
      <div className="retro flex min-h-dvh flex-col items-center justify-center gap-6 bg-emerald-950/10 px-4 py-10 text-center">
        <div className="flex size-16 items-center justify-center border-4 border-amber-400 bg-amber-100 text-amber-600 shadow-[6px_6px_0_rgba(120,53,15,0.35)] dark:bg-amber-950 dark:text-amber-300">
          <Crown aria-hidden="true" className="size-9" />
        </div>
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.3em] text-emerald-700 dark:text-emerald-300">Victory Unlocked</p>
          <h1 className="retro text-3xl text-emerald-700 dark:text-emerald-300">YOU WIN!</h1>
          <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
        </div>

        <Card className="w-full max-w-md border-emerald-500 bg-emerald-50 text-emerald-950 dark:border-emerald-400 dark:bg-emerald-950/60 dark:text-emerald-50">
          <CardHeader className="pb-3">
            <CardTitle className="retro text-sm">{winningTeam.name}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-center">
            <div className="border-2 border-emerald-300/70 p-3 dark:border-emerald-700">
              <p className="text-2xl font-bold">{winningTeam.score}</p>
              <p className="text-[9px] uppercase tracking-wide">Points</p>
            </div>
            <div className="border-2 border-emerald-300/70 p-3 dark:border-emerald-700">
              <div className="flex items-center justify-center gap-2 text-2xl font-bold"><PixelHeart filled size={3} />{winningTeam.life}</div>
              <p className="text-[9px] uppercase tracking-wide">Lives</p>
            </div>
            <div className="border-2 border-emerald-300/70 p-3 dark:border-emerald-700">
              <div className="flex items-center justify-center gap-2 text-2xl font-bold"><Swords className="size-5" />{winningTeam.attack}</div>
              <p className="text-[9px] uppercase tracking-wide">Attack</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users aria-hidden="true" className="size-4" />
          <span>{winningTeam.members.length} {winningTeam.members.length === 1 ? "member" : "members"} secured the treasure</span>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {winningTeam.members.map((member) => (
            <span className="border-2 border-emerald-400/70 bg-emerald-100 px-3 py-1 text-[10px] text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100" key={member.id}>
              {member.email}
            </span>
          ))}
        </div>
        <Button className="mt-2" onClick={() => { toast("Returning to quest map..."); navigate(continuePath); }}>CONTINUE</Button>
      </div>
    );
  }

  return (
    <div className="retro flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="retro text-2xl">
        {isStringResult ? "Better Luck Next Time" : started ? "GAME STARTED!" : correct ? "CORRECT!" : "INCORRECT"}
      </h1>
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
      <Button className="mt-3" onClick={() => {
        toast(continuePath === "/landing" ? "Returning to quest map..." : "Loading current node...");
        navigate(continuePath);
      }}>CONTINUE</Button>
    </div>
  );
};

export default ResultPage;
