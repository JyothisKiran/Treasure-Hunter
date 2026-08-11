import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/8bit/button";
import AttackPanel from "@/components/AttackPanel";
import { useMe } from "@/hooks/queries/useMe";

const AttackPage = () => {
  const navigate = useNavigate();
  const { data: me, isLoading, isError } = useMe();
  const team = me?.team;

  return (
    <div className="flex min-h-dvh flex-col items-center gap-6 px-4 py-20">
      <div className="flex w-full max-w-md items-center justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      {isLoading && <p className="retro text-sm">Loading team...</p>}

      {isError && (
        <p className="retro text-sm text-destructive">
          Couldn't load your team. Try again later.
        </p>
      )}

      {team && (
        <div className="flex w-full max-w-md flex-col gap-6 rounded-lg border bg-background/80 p-6">
          <div className="flex flex-col items-center gap-1">
            <h1 className="retro text-lg">Attack</h1>
            <span className="retro text-xs text-muted-foreground">
              Spend attack points to knock life off another team.
            </span>
          </div>

          <AttackPanel availableAttackPoints={team.attack} />
        </div>
      )}
    </div>
  );
};

export default AttackPage;
