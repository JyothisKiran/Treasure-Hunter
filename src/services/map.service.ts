import { apiClient, ENDPOINTS } from "@/api";
import type {
  BackendMap,
  BackendMapNode,
  CreateMapNodeRequest,
  CreateMapNodeResponse,
  RemoveNodeRelationRequest,
  SetNodeRelationRequest,
  UpdateMapNodeRequest,
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

  updateNode(id: number, data: UpdateMapNodeRequest) {
    return apiClient.patch<BackendMapNode>(ENDPOINTS.NODE(id), data);
  },

  removeRelation(data: RemoveNodeRelationRequest) {
    return apiClient.post<void>(ENDPOINTS.REMOVE_NODE_RELATION, data);
  },

  deleteNode(id: number) {
    return apiClient.delete<void>(ENDPOINTS.NODE(id));
  },
};
