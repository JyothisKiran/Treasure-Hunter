import { useState } from "react";

import { Button } from "@/components/ui/8bit/button";
import { Input } from "@/components/ui/8bit/input";
import { toast } from "@/components/ui/8bit/toast";
import { useTargetTeams } from "@/hooks/queries/useTargetTeams";
import { useTargetAttack } from "@/hooks/mutations/useTargetAttack";

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
  const [attackValue, setAttackValue] = useState(1);

  const teams = targetTeams?.data ?? [];
  const hasAttackPoints = availableAttackPoints > 0;
  const attackErrorMessage = attackError?.response?.data?.detail ?? attackError?.message;

  const handleAttackValueChange = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    setAttackValue(Math.min(Math.max(1, Math.trunc(parsed)), Math.max(1, availableAttackPoints)));
  };

  const handleAttack = () => {
    if (targetTeamId === null || !hasAttackPoints) return;
    attack(
      { target_team: targetTeamId, attack_value: attackValue },
      {
        onSuccess: (data) => {
          toast(data.detail);
          setTargetTeamId(null);
          setAttackValue(1);
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
                  className={`retro flex w-full items-center justify-between rounded border px-3 py-2 text-xs ${
                    targetTeamId === team.id ? "border-primary bg-primary/10" : ""
                  }`}
                >
                  <span>{team.name}</span>
                  <span className="text-muted-foreground">{team.life} LIFE</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={availableAttackPoints}
              value={attackValue}
              onChange={(e) => handleAttackValueChange(e.target.value)}
              className="w-24"
            />
            <Button
              variant="default"
              disabled={targetTeamId === null || isPending}
              onClick={handleAttack}
            >
              {isPending ? "Attacking..." : "Attack"}
            </Button>
          </div>

          {attackErrorMessage && (
            <p className="retro text-xs text-destructive">{attackErrorMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
