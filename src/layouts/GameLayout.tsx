import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";

import Countdown from "@/components/ui/8bit/blocks/countdown";
import HealthBar from "@/components/ui/8bit/blocks/health-bar";
import { useMe } from "@/hooks/queries/useMe";
import { useTeamEvents } from "@/hooks/useTeamEvents";
import { MAX_HEARTS } from "@/lib/constants";
import LobbyPage from "@/routes/LobbyPage";

export default function GameLayout() {
  const { data: me } = useMe();
  const team = me?.team;
  useTeamEvents();

  const [showCountdown, setShowCountdown] = useState(false);
  const prevLifeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!team) return;
    const prevLife = prevLifeRef.current;
    if (prevLife === -1 && team.life === MAX_HEARTS) {
      setShowCountdown(true);
    }
    prevLifeRef.current = team.life;
  }, [team]);

  if (team && team?.is_won) {
    return <Navigate to="/victory" replace />;
  }

  if (team && team.life === 0) {
    return <Navigate to="/game-over" replace />;
  }

  if (team && team.life < 0) {
    return <LobbyPage />;
  }

  if (showCountdown) {
    return <Countdown onComplete={() => setShowCountdown(false)} />;
  }

  return (
    <>
      <HealthBar
        className="fixed inset-x-0 top-0 z-50 p-4"
        hearts={MAX_HEARTS}
        filledHearts={team ? Math.min(Math.max(team.life, 0), MAX_HEARTS) : MAX_HEARTS}
        extraLives={team ? Math.max(team.life - MAX_HEARTS, 0) : 0}
        totalPoints={team?.score ?? 0}
        attackPoints={team?.attack ?? 0}
      />
      <Outlet />
    </>
  );
}
