import { useQueryClient } from "@tanstack/react-query";

import Hero1 from "@/components/ui/8bit/blocks/hero1";
import { useMe } from "@/hooks/queries/useMe";
import { clearTokens } from "@/lib/auth";

const GameOverPage = () => {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const team = me?.team;

  const handleLogout = () => {
    clearTokens();
    queryClient.clear();
    window.location.assign("/login");
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-8">
      <Hero1
        title="GAME OVER"
        subtitle={team ? `${team.name} has fallen.` : "Your team has fallen."}
        description={
          team
            ? `Final score: ${team.score.toLocaleString()} PTS. No continues remain — the hunt ends here.`
            : "No continues remain — the hunt ends here."
        }
        badges={[{ label: "NO CONTINUES", variant: "destructive" }]}
        actions={[
          {
            label: "Logout",
            variant: "outline",
            onClick: handleLogout,
          },
        ]}
      />
    </div>
  );
};

export default GameOverPage;
