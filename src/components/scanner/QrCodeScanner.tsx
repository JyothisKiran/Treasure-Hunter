/* eslint-disable react-hooks/refs */
import { Scanner, type IScannerError } from "@yudiel/react-qr-scanner";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/8bit/button";

interface QrCodeScannerProps {
  onClose: () => void;
  onDetected: (value: string) => void;
}

function getErrorMessage(error: IScannerError) {
  switch (error.kind) {
    case "insecure-context":
      return "Camera access requires HTTPS. Open the secure deployed site on your phone.";
    case "permission-denied":
      return "Camera permission is blocked. Allow it in your browser settings, then try again.";
    case "no-camera":
      return "No usable camera was found on this device.";
    case "in-use":
      return "Your camera is in use by another app. Close it and try again.";
    default:
      return "The camera could not start. Please try again.";
  }
}

export function QrCodeScanner({ onClose, onDetected }: QrCodeScannerProps) {
  const hasDetectedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-5 py-8">
      <section className="w-full max-w-sm border-4 border-ring bg-card p-4">
        <h2 className="retro text-center text-xl">SCAN TREASURE</h2>
        <p className="retro mt-3 text-center text-xs text-muted-foreground">
          Fit the QR code inside the frame.
        </p>

        <div className="relative mt-5 aspect-square overflow-hidden border-2 border-primary bg-black">
          <Scanner
            classNames={{ container: "h-full w-full", video: "h-full w-full object-cover" }}
            constraints={{
              facingMode: { ideal: "environment" },
              height: { ideal: 1080 },
              width: { ideal: 1920 },
            }}
            onError={(scannerError) => setError(getErrorMessage(scannerError))}
            onScan={(codes) => {              
              const value = codes[0]?.rawValue;
              if (!value || hasDetectedRef.current) return;

              hasDetectedRef.current = true;
              onDetected(value);
            }}
            paused={hasDetectedRef.current}
            retryDelay={100}
            startTimeoutMs={10_000}
          />
          <div className="pointer-events-none absolute inset-[12%] border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>

        {error && <p className="retro mt-4 text-center text-xs leading-relaxed text-destructive">{error}</p>}

        <Button className="mt-5 w-full" onClick={onClose} type="button" variant="outline">
          CANCEL
        </Button>
      </section>
    </div>
  );
}
