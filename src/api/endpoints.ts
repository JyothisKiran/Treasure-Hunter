export const ENDPOINTS = {
  LOGIN: "/auth/jwt/create/",
  SIGNUP: "/auth/users/",
  SCANQR: "/nodes/{id}/submit/",
  ME: "/auth/users/me/",
  REFRESH: "/auth/jwt/refresh/",
  TARGET_TEAMS: "/nodes/target-teams/",
  TARGET_ATTACK: "/nodes/target-attack/",
  TEAM_STREAM: "/teams/stream/",
  TEAM_STREAM_TICKET: "/teams/stream-ticket/",
} as const;