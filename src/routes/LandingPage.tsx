import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/8bit/button";
import GameRoadmap1 from "@/components/ui/8bit/blocks/game-roadmap1";

const LandingPage = () => {
  const navigate = useNavigate();
  const [vistedNodes] = useState([])

  return (
    <>
      {vistedNodes.length > 0 ? (
        <GameRoadmap1 />
      ):(
        <div className="flex flex-col items-center justify-center h-screen gap-8 px-4 pt-8">
          <Button onClick={() => navigate('/scan')} type="button">
            Start your journey
          </Button>
          <p className="retro text-center text-xs text-muted-foreground">
            Scan any treasure code to begin your adventure in the pixelquest universe!
          </p>
        </div>
      )}
    </>
  );
};

export default LandingPage;
