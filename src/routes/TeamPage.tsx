import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/8bit/button";
import { useMe } from "@/hooks/queries/useMe";

const TeamPage = () => {
  const navigate = useNavigate();
  const { data: me, isLoading, isError } = useMe();
  const team = me?.team;

  return (
    <div className="flex min-h-dvh flex-col items-center gap-6 px-4 py-20">
      <Button variant="outline" onClick={() => navigate(-1)} className="self-start">
        Back
      </Button>

      {isLoading && <p className="retro text-sm">Loading team...</p>}

      {isError && (
        <p className="retro text-sm text-destructive">
          Couldn't load your team. Try again later.
        </p>
      )}

      {team && (
        <div className="flex w-full max-w-md flex-col gap-6 rounded-lg border bg-background/80 p-6">
          <div className="flex flex-col items-center gap-1">
            <h1 className="retro text-lg">{team.name}</h1>
            <span className="retro text-xs text-muted-foreground">
              {team.score.toLocaleString()} PTS · {team.life} LIFE
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="retro text-xs text-muted-foreground uppercase">
              Teammates
            </h2>
            <ul className="flex flex-col gap-2">
              {team.members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between rounded border px-3 py-2"
                >
                  <span className="retro text-xs">{member.email}</span>
                  {member.email === me?.email && (
                    <span className="retro text-[10px] text-muted-foreground">
                      YOU
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamPage;
