export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  /** PocketBase issues a single auth token; it is renewed in place via
   * auth-refresh rather than exchanged for a separate refresh token. */
  access: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  re_password: string;
}

export interface SignupResponse {
  id: number;
  email: string;
}

export interface SignupErrorResponse {
  email?: string[];
  password?: string[];
  re_password?: string[];
  detail?: string;
  non_field_errors?: string[];
}
export interface LoginErrorResponse {
  detail?: string;
  non_field_errors?: string[];
}

export interface TeamMember {
  id: number;
  email: string;
}

export interface Team {
  id: number;
  name: string;
  score: number;
  life: number;
  attack: number;
  members: TeamMember[];
  is_won: boolean;
}

export interface MeResponse {
  id: number;
  email: string;
  team: Team;
}

export interface TargetTeam {
  id: number;
  name: string;
  score: number;
  life: number;
  attack: number;
}

export interface TargetTeamsResponse {
  detail: string;
  data: TargetTeam[];
}

export interface TargetAttackRequest {
  target_team: number;
  attack_value: number;
}

export interface TargetAttackResponse {
  detail: string;
  data?: {
    target_team?: string;
    remaining_life?: number;
    available_attack_points?: number;
  };
}

/** The notification stamped onto a team by the backend, delivered with the
 * record over PocketBase's realtime feed. */
export interface TeamEventPayload {
  seq: number;
  kind: "team_attacked" | "team_update";
  detail: string;
  attacked_by?: string;
  damage?: number;
}

/** A `teams` record as PocketBase pushes it (raw collection fields, not the
 * shaped `Team` the /api/me endpoint returns). */
export interface TeamRecord {
  id: string;
  name: string;
  life: number;
  score: number;
  attack: number;
  is_won: boolean;
  last_event?: TeamEventPayload;
}