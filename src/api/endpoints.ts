export const ENDPOINTS = {
  LOGIN: "/auth/jwt/create/",
  SIGNUP: "/auth/users/",
  SCANQR: (id: string) =>  `/nodes/${id}/submit/`,
  CURRENT_NODE: '/nodes/current/',
  ME: "/auth/users/me/",
  REFRESH: "/auth/jwt/refresh/",
  TARGET_TEAMS: "/nodes/target-teams/",
  TARGET_ATTACK: "/nodes/target-attack/",
  TEAM_STREAM: "/teams/stream/",
  TEAM_STREAM_TICKET: "/teams/stream-ticket/",
} as const;