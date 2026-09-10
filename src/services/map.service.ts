import { apiClient, ENDPOINTS } from "@/api";
import type {
  BackendMap,
  CreateMapNodeRequest,
  CreateMapNodeResponse,
  SetNodeRelationRequest,
} from "@/types/map";

export const mapService = {
  getMaps() {
    return apiClient.get<BackendMap>(ENDPOINTS.MAPS);
  },

  createNode(data: CreateMapNodeRequest) {
    return apiClient.post<CreateMapNodeResponse>(ENDPOINTS.NODES, data);
  },

  setRelation(data: SetNodeRelationRequest) {
    return apiClient.post<void>(ENDPOINTS.SET_NODE_RELATION, data);
  },

  deleteNode(id: number) {
    return apiClient.delete<void>(ENDPOINTS.NODE(id));
  },
};
