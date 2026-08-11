import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { teamService } from "@/services/team.service";
import type { TargetAttackRequest, TargetAttackResponse } from "@/types/auth";

export function useTargetAttack() {
  const queryClient = useQueryClient();

  return useMutation<TargetAttackResponse, AxiosError<TargetAttackResponse>, TargetAttackRequest>({
    mutationFn: async (data) => {
      const response = await teamService.targetAttack(data);
      return response.data;
    },
    onSuccess: () => {
      // The attacker's own SSE stream also delivers a team_update event,
      // but refetching here keeps things correct even if that race loses.
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["target-teams"] });
    },
  });
}
