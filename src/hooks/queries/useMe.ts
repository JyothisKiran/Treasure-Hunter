import { useQuery } from "@tanstack/react-query";
import type { ApiError } from "@/api/client";

import { authService } from "@/services/auth.service";
import { getAccessToken } from "@/lib/auth";
import type { MeResponse } from "@/types/auth";

export function useMe() {
  return useQuery<MeResponse, ApiError>({
    queryKey: ["me"],
    queryFn: async () => {
      const response = await authService.getMe();
      return response.data;
    },
    enabled: Boolean(getAccessToken()),
  });
}
