import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";

import { teamService } from "@/services/team.service";
import { getAccessToken } from "@/lib/auth";
import type { TargetTeamsResponse } from "@/types/auth";

export function useTargetTeams() {
  return useQuery<TargetTeamsResponse, AxiosError>({
    queryKey: ["target-teams"],
    queryFn: async () => {
      const response = await teamService.getTargetTeams();
      return response.data;
    },
    enabled: Boolean(getAccessToken()),
  });
}
