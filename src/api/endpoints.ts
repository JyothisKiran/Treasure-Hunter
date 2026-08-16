/** Custom game routes served by the Go backend (see backend-go/api.go).
 *
 * Auth and the realtime team feed are PocketBase's own APIs and are reached
 * through the SDK (`pb.collection(USERS_COLLECTION)`, `pb.collection(TEAMS_COLLECTION).subscribe`)
 * rather than by URL. */
export const ENDPOINTS = {
  ME: "/api/me",
  SCANQR: (id: string) => `/api/nodes/${id}/submit`,
  CURRENT_NODE: "/api/nodes/current",
  VISITED_NODES: "/api/nodes/visited",
  TARGET_TEAMS: "/api/nodes/target-teams",
  TARGET_ATTACK: "/api/nodes/target-attack",
} as const;

export const USERS_COLLECTION = "users";
export const TEAMS_COLLECTION = "teams";
