import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";

import { authService } from "@/services/auth.service";
import type { MeResponse } from "@/types/auth";

export function useMe() {
  return useQuery<MeResponse, AxiosError>({
    queryKey: ["me"],
    queryFn: async () => {
      const response = await authService.getMe();
      return response.data;
    },
    enabled: Boolean(localStorage.getItem("access")),
  });
}
