import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";

import { getAccessToken } from "@/lib/auth";
import { mapService } from "@/services/map.service";
import type { BackendMapSkeleton } from "@/types/map";

export const MAPS_QUERY_KEY = ["map-maps"] as const;

export function useGetMapSkeleton() {
  return useQuery<BackendMapSkeleton, AxiosError>({
    queryKey: MAPS_QUERY_KEY,
    queryFn: async () => (await mapService.getMapSkeleton()).data,
    enabled: Boolean(getAccessToken()),
  });
}
