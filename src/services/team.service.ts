import { apiClient, ENDPOINTS } from "@/api";
import type {
  StreamTicketResponse,
  TargetAttackRequest,
  TargetAttackResponse,
  TargetTeamsResponse,
} from "@/types/auth";

export const teamService = {
  getTargetTeams() {
    return apiClient.get<TargetTeamsResponse>(ENDPOINTS.TARGET_TEAMS);
  },

  targetAttack(data: TargetAttackRequest) {
    return apiClient.post<TargetAttackResponse>(ENDPOINTS.TARGET_ATTACK, data);
  },

  getStreamTicket() {
    return apiClient.post<StreamTicketResponse>(ENDPOINTS.TEAM_STREAM_TICKET);
  },
};
