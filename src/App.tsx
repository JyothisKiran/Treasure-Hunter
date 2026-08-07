import Hero1 from "./components/ui/8bit/blocks/hero1";
import LoginPage from "./domains/auth/Login";
import SignUp from "./domains/auth/Signup";
import AppLayout from "./layouts/AppLayout";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";

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
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUp />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
