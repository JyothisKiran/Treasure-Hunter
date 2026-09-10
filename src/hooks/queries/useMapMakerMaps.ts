import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";

import { getAccessToken } from "@/lib/auth";
import { mapService } from "@/services/map.service";
import type { BackendMap } from "@/types/map";

export const MAP_MAKER_MAPS_QUERY_KEY = ["map-maker-maps"] as const;

export function useMapMakerMaps() {
  return useQuery<BackendMap, AxiosError>({
    queryKey: MAP_MAKER_MAPS_QUERY_KEY,
    queryFn: async () => (await mapService.getMaps()).data,
    enabled: Boolean(getAccessToken()),
  });
}
