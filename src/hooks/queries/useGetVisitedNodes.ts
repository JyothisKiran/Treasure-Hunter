import { useQuery } from "@tanstack/react-query";

import { detailService } from "@/services/features.service";


export function useGetVisitedNodes(path?: string | null) {
  return useQuery<any, Error>({
    queryKey: ["visited-nodes", path ?? null],
    queryFn: async () => {
      const response = await detailService.getVisitedNodes(path);
      return response.data
    },
  });
}
