import Hero1 from "@/components/ui/8bit/blocks/hero1";

const LobbyPage = () => {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-8">
      <Hero1
        title="LOBBY"
        subtitle="Game starting soon..."
        description="Sit tight, hunter. The gates will open once the game master kicks things off."
        badges={[{ label: "WAITING", variant: "secondary" }]}
      >
        <div className="mt-8 flex justify-center gap-2" aria-hidden="true">
          <span className="size-3 animate-bounce bg-foreground [animation-delay:-0.3s] dark:bg-ring" />
          <span className="size-3 animate-bounce bg-foreground [animation-delay:-0.15s] dark:bg-ring" />
          <span className="size-3 animate-bounce bg-foreground dark:bg-ring" />
        </div>
      </Hero1>
    </div>
  );
};

export default LobbyPage;
