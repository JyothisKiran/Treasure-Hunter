import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/api/client";
import type { ScanQrResult } from "@/types/detail";
import { detailService } from "@/services/features.service";

export function useScanQr() {
  const queryClient = useQueryClient();

  return useMutation<ScanQrResult, ApiError, string>({
    // A rejected scan (wrong answer, out of sequence) is a normal outcome with
    // a body to show, so the service resolves on 4xx and only genuine
    // transport/server failures reach the error path.
    mutationFn: async (id) => {
      const response = await detailService.scanqr(id);
      return { data: response.data, status: response.status };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["current-node"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["visited-nodes"] });
    },
  });
}
