/* eslint-disable react-hooks/static-components */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lightbulb } from "lucide-react";


import AnswerInput from "@/components/AnswerInput";
import { Button } from "@/components/ui/8bit/button";
import { Card, CardContent } from "@/components/ui/8bit/card";
import { useCurrentNode } from "@/hooks/queries/useCurrentNode";
import type { NodeAnswer } from "@/types/detail";
import { useScanQr } from "@/hooks/mutations/useScanQr";
import { toast } from "@/components/ui/8bit/toast";

const DetailPage = () => {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState("");
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const qrScanMutation = useScanQr();

  const { data: result, isPending, isError } = useCurrentNode();

  if (isPending) return <p className="retro flex min-h-dvh items-center justify-center text-xs">Loading question...</p>;
  if (isError) return <p className="retro flex min-h-dvh items-center justify-center text-xs text-destructive">Unable to load the current question.</p>;

  if (!result?.node) {
    const gameNotStarted = result?.detail?.toLowerCase() === "game not started yet.";

    return (
      <div className="retro flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="retro text-2xl">{gameNotStarted ? "GAME NOT STARTED" : "UNAVAILABLE"}</h1>
        <p className="retro text-sm text-muted-foreground">{result?.detail ?? "Unable to load the current question."}</p>
        {gameNotStarted && <Button onClick={() => navigate("/scan")}>START SCANNING</Button>}
      </div>
    );
  }

  const { node } = result;
  const handleAnswerSelect = (answerId: number) => {
    setSelectedAnswer(answerId);
    qrScanMutation.mutate(answerId.toString(), {
      onSuccess: () => {
        localStorage.setItem(String(node.id), String(answerId));
        navigate("/detail");
      },
      onError: () => {
        toast("An Error occured. Please try again");
      },
    });
  };

  const JunctionOptions = ({ answers }: { answers: NodeAnswer[] }) => {
    return(
      <div className="retro flex w-full max-w-xl flex-col gap-4 sm:flex-row">
        {answers.map((item) => {
          const isEasyWay = item.is_nearest;
          const isSelected = selectedAnswer === item.id;

          return (
            <Button
              aria-pressed={isSelected}
              className={`h-auto min-h-20 flex-1 flex-col gap-2 px-6 py-4 ${
                isEasyWay
                  ? "bg-emerald-100 text-emerald-950 hover:bg-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-50 dark:hover:bg-emerald-900/80"
                  : "bg-red-100 text-red-950 hover:bg-red-200 dark:bg-red-900/60 dark:text-red-50 dark:hover:bg-red-900/80"
              } ${isSelected ? "ring-2 ring-offset-2" : ""}`}
              key={item.id}
              disabled={qrScanMutation.isPending}
              onClick={() => handleAnswerSelect(item.id)}
              type="button"
            >
              <span className="text-base font-bold">{item.answer}</span>
              <span className="text-[10px] uppercase tracking-wide">
                {isEasyWay ? "The Easy Way" : "The Hard Way"}
              </span>
            </Button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-8">
      <p className="retro text-center text-md text-muted-foreground capitalize">
        {node.data}
      </p>
      {node.clue?.trim() && (
        <Card className="w-full max-w-xl border-amber-400 bg-amber-50/80 text-amber-950 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-50">
          <CardContent className="flex items-start gap-4 px-5 py-4">
            <div className="flex size-10 shrink-0 items-center justify-center border-2 border-amber-500 bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              <Lightbulb aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0 text-left">
              <p className="retro mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
                Clue Detected
              </p>
              <p className="retro text-xs leading-relaxed text-amber-950/80 dark:text-amber-50/90">
                {node.clue}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {node.effects==="JUNCTION" ? (
        <JunctionOptions answers={node.answers} />
      ) : (
        <>
          <AnswerInput
            pattern={node.encoded_answer}
            value={answer}
            onChange={setAnswer}
          />
          <Button onClick={() => navigate('/scan')}>Scan</Button>
        </>
      )}
    </div>
  );
};

export default DetailPage;
