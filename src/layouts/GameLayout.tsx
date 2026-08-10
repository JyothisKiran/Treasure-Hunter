import { Outlet } from "react-router-dom";

import HealthBar from "@/components/ui/8bit/blocks/health-bar";

export default function GameLayout() {
  return (
    <>
      <HealthBar className="fixed top-0 left-0 z-50 p-4" />
      <Outlet />
    </>
  );
}
