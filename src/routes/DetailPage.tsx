import { useState } from "react";
import { useNavigate } from "react-router-dom";


import AnswerInput from "@/components/AnswerInput";
import { Button } from "@/components/ui/8bit/button";
import { useCurrentNode } from "@/hooks/queries/useCurrentNode";
const DetailPage = () => {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState("");
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

  return (
    <div className="realtive flex flex-col items-center justify-center h-screen gap-8 px-4 pt-8">
      <p
        className="retro absolute top-4 left-4"
        onClick={() => navigate("/landing")}
      >
        &lt; Go Back
      </p>
      <p className="retro text-center text-md text-muted-foreground capitalize">
        {node.data}
      </p>
      <AnswerInput
        pattern={node.encoded_answer}
        value={answer}
        onChange={setAnswer}
      />
      <Button onClick={() => navigate('/scan')}>Scan</Button>
    </div>
  );
};

export default DetailPage;
