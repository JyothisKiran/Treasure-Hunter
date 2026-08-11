import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/8bit/avatar";
import { Button } from "@/components/ui/8bit/button";
import { toast } from "@/components/ui/8bit/toast";
import { HeartRow } from "@/components/ui/8bit/blocks/pixel-heart";
import { useTargetTeams } from "@/hooks/queries/useTargetTeams";
import { useTargetAttack } from "@/hooks/mutations/useTargetAttack";
import { MAX_HEARTS } from "@/lib/constants";

interface AttackPanelProps {
  availableAttackPoints: number;
}

export default function AttackPanel({ availableAttackPoints }: AttackPanelProps) {
  const {
    data: targetTeams,
    isLoading,
    isError: isTargetTeamsError,
    refetch: refetchTargetTeams,
    isFetching: isRefetchingTargetTeams,
  } = useTargetTeams();
  const { mutate: attack, isPending, error: attackError } = useTargetAttack();
  const [targetTeamId, setTargetTeamId] = useState<number | null>(null);

  const teams = targetTeams?.data ?? [];
  const hasAttackPoints = availableAttackPoints > 0;
  const attackErrorMessage = attackError?.response?.data?.detail ?? attackError?.message;

  const handleAttack = () => {
    if (targetTeamId === null || !hasAttackPoints) return;
    attack(
      { target_team: targetTeamId, attack_value: 1 },
      {
        onSuccess: (data) => {
          toast(data.detail);
          setTargetTeamId(null);
        },
        onError: (error) => {
          toast(error.response?.data?.detail ?? "Attack failed. Please try again.");
        },
      }
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded border p-4">
      <div className="flex items-center justify-between">
        <h2 className="retro text-xs text-muted-foreground uppercase">Attack</h2>
        <span className="retro text-xs text-muted-foreground">
          {availableAttackPoints} PTS AVAILABLE
        </span>
      </div>

      {!hasAttackPoints && (
        <p className="retro text-xs text-muted-foreground">
          You don't have any attack points yet. Collect them along the trail.
        </p>
      )}

      {hasAttackPoints && isLoading && (
        <p className="retro text-xs">Loading targets...</p>
      )}

      {hasAttackPoints && isTargetTeamsError && (
        <div className="flex flex-col items-start gap-2">
          <p className="retro text-xs text-destructive">
            Couldn't load teams to attack. Check your connection and try again.
          </p>
          <Button
            variant="outline"
            onClick={() => refetchTargetTeams()}
            disabled={isRefetchingTargetTeams}
          >
            {isRefetchingTargetTeams ? "Retrying..." : "Retry"}
          </Button>
        </div>
      )}

      {hasAttackPoints && !isLoading && !isTargetTeamsError && teams.length === 0 && (
        <p className="retro text-xs text-muted-foreground">
          No teams available to attack right now.
        </p>
      )}

      {hasAttackPoints && !isTargetTeamsError && teams.length > 0 && (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {teams.map((team) => (
              <li key={team.id}>
                <button
                  type="button"
                  onClick={() => setTargetTeamId(team.id)}
                  className={`flex w-full items-center gap-2 rounded border px-3 py-2 ${
                    targetTeamId === team.id ? "border-primary bg-primary/10" : ""
                  }`}
                >
                  <Avatar>
                    <AvatarImage
                      src="https://8bitcn.com/images/pixelized-8bitcnorc.jpg"
                      alt={team.name}
                    />
                    <AvatarFallback>{team.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <span className="retro truncate text-xs">{team.name}</span>
                    <HeartRow
                      hearts={MAX_HEARTS}
                      filledHearts={Math.min(Math.max(team.life, 0), MAX_HEARTS)}
                      heartSize={3}
                    />
                    <span className="retro text-[10px] tracking-tight text-muted-foreground">
                      {team.score.toLocaleString()} PTS
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <Button
            variant="default"
            disabled={targetTeamId === null || isPending}
            onClick={handleAttack}
          >
            {isPending ? "Attacking..." : "Attack"}
          </Button>

          {attackErrorMessage && (
            <p className="retro text-xs text-destructive">{attackErrorMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
