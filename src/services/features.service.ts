import { apiClient, ENDPOINTS } from "@/api";
import type { CurrentNodeResponse, ScanResponsePayload } from "@/types/detail";


export const detailService = {
  scanqr(id: string) {
    return apiClient.post<ScanResponsePayload>(
      ENDPOINTS.SCANQR(id),
      {},
      // QR submission can return useful payloads for non-2xx statuses.
      // Let callers inspect response.data even for 400 responses.
      { validateStatus: () => true },
    );
  },

  getCurrentNode() {
    return apiClient.get<CurrentNodeResponse>(
      ENDPOINTS.CURRENT_NODE,
      // The API communicates game state (such as "Game not started yet.")
      // in a 400 response body.
      { validateStatus: () => true },
    );
  },

  getVisitedNodes() {
    return apiClient.get<any>(
      ENDPOINTS.VISITED_NODES,
      // The API communicates game state (such as "Game not started yet.")
      // in a 400 response body.
      { validateStatus: () => true },
    );
  },
};
