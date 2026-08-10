import Hero1 from "./components/ui/8bit/blocks/hero1";
import LoginPage from "./domains/auth/Login";
import SignUp from "./domains/auth/Signup";
import AppLayout from "./layouts/AppLayout";
import GameLayout from "./layouts/GameLayout";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import LandingPage from "./routes/LandingPage";
import QueryProvider from "./providers/QueryProvider";
import ScannerPage from "./routes/ScannerPage";
import DetailPage from "./routes/DetailPage";
import TeamPage from "./routes/TeamPage";

function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-8">
      <Hero1
        title="TREASURE HUNTER"
        subtitle="Embark on a pixelated adventure to uncover hidden treasures."
        actions={[
          {
            label: "START QUEST",
            variant: "default",
            onClick: () => navigate("/login"),
          },
        ]}
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignUp />} />
            <Route element={<GameLayout />}>
              <Route path="/landing" element={<LandingPage />} />
              <Route path="/scan" element={<ScannerPage />} />
              <Route path="/detail" element={<DetailPage />} />
              <Route path="/team" element={<TeamPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryProvider>
  );
}
