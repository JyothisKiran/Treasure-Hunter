import { Navigate, Outlet } from "react-router-dom";

import { getAccessToken } from "@/lib/auth";

export default function RequireGuest() {
  if (getAccessToken()) {
    return <Navigate to="/landing" replace />;
  }

  return <Outlet />;
}
