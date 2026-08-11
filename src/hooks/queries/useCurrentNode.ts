import { useQuery } from "@tanstack/react-query";

import { detailService } from "@/services/detail.service";
import type { CurrentNodeResponse, CurrentNodeResult } from "@/types/detail";

function unwrapCurrentNode(response: CurrentNodeResponse, status: number): CurrentNodeResult {
  if ("id" in response) return { node: response, status };
  if ("data" in response) return { node: response.data, status };

  return { detail: response.detail, status };
}

export function useCurrentNode() {
  return useQuery<CurrentNodeResult, Error>({
    queryKey: ["current-node"],
    queryFn: async () => {
      const response = await detailService.getCurrentNode();
      return unwrapCurrentNode(response.data, response.status);
    },
  });
}
