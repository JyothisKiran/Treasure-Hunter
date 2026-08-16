import { useQuery } from "@tanstack/react-query";
import type { ApiError } from "@/api/client";

import { teamService } from "@/services/team.service";
import { getAccessToken } from "@/lib/auth";
import type { TargetTeamsResponse } from "@/types/auth";

export function useTargetTeams() {
  return useQuery<TargetTeamsResponse, ApiError>({
    queryKey: ["target-teams"],
    queryFn: async () => {
      const response = await teamService.getTargetTeams();
      return response.data;
    },
    enabled: Boolean(getAccessToken()),
  });
}
