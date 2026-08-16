import { request } from "@/api/client";
import { ENDPOINTS } from "@/api/endpoints";
import type { CurrentNodeResponse, ScanResponsePayload } from "@/types/detail";

export const detailService = {
  scanqr(id: string) {
    return request<ScanResponsePayload>(ENDPOINTS.SCANQR(id), {
      method: "POST",
      // A wrong answer or an out-of-sequence scan is a 400 whose body the
      // result screen still needs to read.
      acceptErrorBody: true,
    });
  },

  getCurrentNode() {
    return request<CurrentNodeResponse>(ENDPOINTS.CURRENT_NODE, {
      // The API communicates game state (such as "Game not started yet.")
      // in a 400 response body.
      acceptErrorBody: true,
    });
  },

  getVisitedNodes(path?: string | null) {
    return request<any>(ENDPOINTS.VISITED_NODES, {
      query: path ? { path } : undefined,
      acceptErrorBody: true,
    });
  },
};
