export const ENDPOINTS = {
  LOGIN: "/auth/jwt/create/",
  SIGNUP: "/auth/users/",
  SCANQR: (id: string) =>  `/nodes/${id}/submit/`,
  CURRENT_NODE: '/nodes/current/'
} as const;