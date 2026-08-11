import { useScanQr } from "@/hooks/mutations/useScanQr";
import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/8bit/button";
import { toast } from "@/components/ui/8bit/toast";

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

  if (!result) return <p className="retro flex min-h-dvh items-center justify-center text-center text-xs text-destructive">The server returned an empty response.</p>;

  return (
    <div className="retro flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="retro text-2xl">{started ? "GAME STARTED!" : correct ? "CORRECT!" : "INCORRECT"}</h1>
      <p className="retro text-sm text-muted-foreground">{detail}</p>
      {(score !== undefined || bonus !== undefined) && <p className="text-lg">{score !== undefined && `${score > 0 ? "+" : ""}${score} XP`}{bonus ? ` · +${bonus} BONUS` : ""}</p>}
      <Button onClick={() => { toast("Loading current node..."); navigate(`/detail?from=${encodeURIComponent(code)}`); }}>CONTINUE</Button>
    </div>
  );
}

export default ResultPage
