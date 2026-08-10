import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { QrCodeScanner } from "@/components/scanner/QrCodeScanner";
import { Button } from "@/components/ui/8bit/button";
import GameRoadmap1 from "@/components/ui/8bit/blocks/game-roadmap1";

const LandingPage = () => {
  const navigate = useNavigate();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedValue, setScannedValue] = useState<string | null>(null);
  const [vistedNodes, setVisitedNodes] = useState([])

  const handleDetected = (value: string) => {
    setIsScannerOpen(false);
    setScannedValue(value);

    if (value.startsWith("/") && !value.startsWith("//")) {
      navigate(value);
      return;
    }

    try {
      const url = new URL(value);
      if (url.origin === window.location.origin) {
        navigate(`${url.pathname}${url.search}${url.hash}`);
      }
    } catch {
      // Plain-text treasure codes remain visible on the landing page.
    }
  };

  return (
    <>
      <div className="flex flex-col items-center gap-4 px-4 pt-8">
        <Button onClick={() => setIsScannerOpen(true)} type="button">
          SCAN TREASURE
        </Button>
        {scannedValue && (
          <p className="retro max-w-sm break-all text-center text-xs text-primary">
            TREASURE CODE: {scannedValue}
          </p>
        )}
      </div>
      {vistedNodes.length > 0 ? (
        <GameRoadmap1 />
      ):(
        <div className="flex flex-col items-center justify-center h-screen gap-8 px-4 pt-8">
          {/* <p className="retro text-center text-xl text-muted-foreground">
            Start your journey
          </p> */}
          <Button onClick={() => setIsScannerOpen(true)} type="button">
            Start your journey
          </Button>
          <p className="retro text-center text-xs text-muted-foreground">
            Scan any treasure code to begin your adventure in the pixelquest universe!
          </p>
        </div>
      )}
      {isScannerOpen && (
        <QrCodeScanner
          onClose={() => setIsScannerOpen(false)}
          onDetected={handleDetected}
        />
      )}
    </>
  );
};

export default LandingPage;
