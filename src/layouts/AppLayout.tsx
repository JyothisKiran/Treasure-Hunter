import { Outlet } from "react-router-dom";

import treasureHunterBackground from "@/assets/bg-treasurehunter.png";

export default function AppLayout() {
  return (
    <main
      className="min-h-[100dvh] bg-cover bg-center bg-scroll bg-no-repeat sm:bg-fixed"
      style={{ backgroundImage: `url(${treasureHunterBackground})` }}
    >
      <Outlet />
    </main>
  );
}
