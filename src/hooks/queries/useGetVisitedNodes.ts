import { useQuery } from "@tanstack/react-query";

import { detailService } from "@/services/features.service";


export function useGetVisitedNodes() {
  return useQuery<any, Error>({
    queryKey: ["visited-nodes"],
    queryFn: async () => {
      const response = await detailService.getVisitedNodes();
      return response.data
    },
  });
}
