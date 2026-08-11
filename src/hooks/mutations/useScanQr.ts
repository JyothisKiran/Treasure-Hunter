import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError, isAxiosError } from "axios";

import type { ScanQrResult, SubmitScanResponse } from "@/types/detail";
import { detailService } from "@/services/detail.service";

export function useScanQr() {
  const queryClient = useQueryClient();

  return useMutation<
    ScanQrResult,
    AxiosError,
    string
  >({
    mutationFn: async (id) => {
      try {
        const response = await detailService.scanqr(id);
        return { data: response.data, status: response.status };
      } catch (error) {
        
        if (isAxiosError<SubmitScanResponse>(error) && error.response) {
          return { data: error.response.data, status: error.response.status };
        }

        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["current-node"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}