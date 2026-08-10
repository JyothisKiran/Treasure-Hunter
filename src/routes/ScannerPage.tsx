import { QrCodeScanner } from "@/components/scanner/QrCodeScanner";
import { useNavigate } from "react-router-dom";

const ScannerPage = () => {
  const navigate = useNavigate();

  const handleDetected = (value: string) => {
    navigate(`/detail?code=${encodeURIComponent(value)}`);
  };

  return (
    <div className="flex flex-col items-center gap-4 px-4 pt-8">
      <QrCodeScanner
        onClose={() => navigate(-1)}
        onDetected={handleDetected}
      />
    </div>
  );
};

export default ScannerPage;