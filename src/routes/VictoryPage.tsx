import { Crown, Swords, Trophy, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { PixelHeart } from "@/components/ui/8bit/blocks/pixel-heart";
import { Spinner } from "@/components/ui/8bit/spinner";
import { useMe } from "@/hooks/queries/useMe";

const VictoryPage = () => {
  const { data: me, isLoading, isError } = useMe();
  const team = me?.team;

  if (isLoading) {
    return (
      <div className="retro flex min-h-dvh flex-col items-center justify-center gap-4 text-xs">
        <Spinner variant="diamond" className="size-8 text-amber-400" />
        <p className="animate-pulse">Loading victory results...</p>
      </div>
    );
  }

  if (isError || !team) {
    return (
      <div className="retro flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <Trophy className="size-12 text-amber-400" aria-hidden="true" />
        <h1 className="text-xl">TREASURE CLAIMED</h1>
        <p className="text-xs text-muted-foreground">
          Your team won, but the final team details could not be loaded.
        </p>
      </div>
    );
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-emerald-950/20 px-4 py-12 text-center">
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,rgba(250,204,21,0.35)_0,transparent_28%),radial-gradient(circle_at_80%_70%,rgba(16,185,129,0.35)_0,transparent_30%)]" />

      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-7">
        <div className="flex size-20 items-center justify-center border-4 border-amber-400 bg-amber-100 text-amber-600 shadow-[7px_7px_0_rgba(120,53,15,0.4)] dark:bg-amber-950 dark:text-amber-300">
          <Crown aria-hidden="true" className="size-11" />
        </div>

        <div className="space-y-3">
          {/* <p className="retro text-[10px] uppercase tracking-[0.35em] text-amber-500">
            Quest Complete
          </p> */}
          <h1 className="retro text-3xl text-emerald-700 dark:text-emerald-300 sm:text-4xl">
            Quest Completed!
          </h1>
          <p className="retro text-xs leading-relaxed text-muted-foreground">
            <span> The treasure belongs to</span> <br/> <span className="text-foreground">{team.name}</span>.
          </p>
        </div>

        <Card className="w-full border-emerald-500 bg-emerald-50 text-emerald-950 dark:border-emerald-400 dark:bg-emerald-950/70 dark:text-emerald-50">
          <CardHeader className="flex items-center gap-4 pb-4">
            <Trophy aria-hidden="true" className="size-6 text-amber-500" />
            <CardTitle className="retro text-sm">Final Scoreboard</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <div className="border-2 border-emerald-300/70 p-4 dark:border-emerald-700">
              <p className="text-2xl font-bold">{team.score.toLocaleString()}</p>
              <p className="retro mt-1 text-[9px] uppercase tracking-wide">Points</p>
            </div>
            <div className="border-2 border-emerald-300/70 p-4 dark:border-emerald-700">
              <div className="flex items-center justify-center gap-2 text-2xl font-bold">
                <PixelHeart filled size={3} />
                {team.life}
              </div>
              <p className="retro mt-1 text-[9px] uppercase tracking-wide">Lives</p>
            </div>
            <div className="border-2 border-emerald-300/70 p-4 dark:border-emerald-700">
              <div className="flex items-center justify-center gap-2 text-2xl font-bold">
                <Swords aria-hidden="true" className="size-5" />
                {team.attack}
              </div>
              <p className="retro mt-1 text-[9px] uppercase tracking-wide">Attack</p>
            </div>
          </CardContent>
        </Card>

        <section className="w-full space-y-3">
          <div className="flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-300">
            <Users aria-hidden="true" className="size-4" />
            <h2 className="retro text-xs">Treasure Hunters</h2>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {team.members.map((member) => (
              <span
                className="retro border-2 border-emerald-400/70 bg-emerald-100 px-3 py-2 text-[10px] text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"
                key={member.id}
              >
                {member.email}
                {member.email === me.email && " - YOU"}
              </span>
            ))}
          </div>
        </section>

        <p className="retro text-[10px] text-muted-foreground">
          The hunt is complete. Your legend is now part of the map.
        </p>
      </div>
    </main>
  );
};

export default VictoryPage;
