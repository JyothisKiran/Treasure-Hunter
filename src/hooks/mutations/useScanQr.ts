import { useMutation } from "@tanstack/react-query";
import { AxiosError } from "axios";

import type { ScanQrResponse } from "@/types/detail";
import { detailService } from "@/services/detail.service";

export function useScanQr() {
  return useMutation<
    ScanQrResponse,
    AxiosError,
    string
  >({
    mutationFn: async (id) => {
      const response = await detailService.scanqr(id);
      return response.data;
    },
  });
}