import { apiClient, ENDPOINTS } from "@/api";
import type {  ScanQrResponse } from "@/types/detail";


export const detailService = {
  scanqr(id: string){
    return apiClient.post<ScanQrResponse>(
        ENDPOINTS.SCANQR(id),
        {}
    )
  }
};