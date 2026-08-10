export const ENDPOINTS = {
  LOGIN: "/auth/jwt/create/",
  SIGNUP: "/auth/users/",
  SCANQR: "/nodes/{id}/submit/",
  ME: "/auth/users/me/"
} as const;