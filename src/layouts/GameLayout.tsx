import { Navigate, Outlet } from "react-router-dom";

import HealthBar from "@/components/ui/8bit/blocks/health-bar";
import { useMe } from "@/hooks/queries/useMe";
import { useTeamEvents } from "@/hooks/useTeamEvents";

const MAX_HEARTS = 5;

export default function GameLayout() {
  const { data: me } = useMe();
  const team = me?.team;
  useTeamEvents();

  if (team && team.life <= 0) {
    return <Navigate to="/game-over" replace />;
  }

  return (
    <>
      <HealthBar
        className="fixed top-0 left-0 z-50 p-4"
        hearts={MAX_HEARTS}
        filledHearts={team ? Math.min(Math.max(team.life, 0), MAX_HEARTS) : MAX_HEARTS}
        totalPoints={team?.score ?? 0}
      />
      <Outlet />
    </>
  );
}
