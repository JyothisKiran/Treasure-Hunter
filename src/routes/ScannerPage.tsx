import { QrCodeScanner } from "@/components/scanner/QrCodeScanner";
import { useNavigate } from "react-router-dom";

const ScannerPage = () => {
    const navigate = useNavigate();

    const handleDetected = (value: string) => {
        console.log(value)
        navigate(`/landing?code=${value}`)

        try {
        const url = new URL(value);
        if (url.origin === window.location.origin) {
            navigate(`${url.pathname}${url.search}${url.hash}`);
        }
        } catch {
        // Plain-text treasure codes remain visible on the landing page.
        }
    };
    return(
        <>
        <div className="flex flex-col items-center gap-4 px-4 pt-8">
            <QrCodeScanner
                onClose={() => navigate(-1)}
                onDetected={handleDetected}
            />
        </div>
        </>
    )
}

export default ScannerPage