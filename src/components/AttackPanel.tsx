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
  const { data: targetTeams, isLoading } = useTargetTeams();
  const { mutate: attack, isPending } = useTargetAttack();
  const [targetTeamId, setTargetTeamId] = useState<number | null>(null);
  const [attackValue, setAttackValue] = useState(1);

  const teams = targetTeams?.data ?? [];

  const handleAttack = () => {
    if (targetTeamId === null) return;
    attack(
      { target_team: targetTeamId, attack_value: attackValue },
      {
        onSuccess: (data) => toast(data.detail),
        onError: (error) => toast(error.response?.data?.detail ?? "Attack failed."),
      }
    );
  };

  if (availableAttackPoints <= 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded border p-4">
      <div className="flex items-center justify-between">
        <h2 className="retro text-xs text-muted-foreground uppercase">Attack</h2>
        <span className="retro text-xs text-muted-foreground">
          {availableAttackPoints} PTS AVAILABLE
        </span>
      </div>

      {isLoading && <p className="retro text-xs">Loading targets...</p>}

      {!isLoading && teams.length === 0 && (
        <p className="retro text-xs text-muted-foreground">
          No teams available to attack right now.
        </p>
      )}

      {teams.length > 0 && (
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
              onChange={(e) =>
                setAttackValue(
                  Math.min(Math.max(1, Number(e.target.value)), availableAttackPoints)
                )
              }
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
        </div>
      )}
    </div>
  );
}
