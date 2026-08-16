import { request } from "@/api/client";
import { ENDPOINTS } from "@/api/endpoints";
import type { TargetAttackRequest, TargetAttackResponse, TargetTeamsResponse } from "@/types/auth";

export const teamService = {
  getTargetTeams() {
    return request<TargetTeamsResponse>(ENDPOINTS.TARGET_TEAMS);
  },

  targetAttack(data: TargetAttackRequest) {
    return request<TargetAttackResponse>(ENDPOINTS.TARGET_ATTACK, {
      method: "POST",
      body: data,
    });
  },
};
