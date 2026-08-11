export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
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

export interface StreamTicketResponse {
  ticket: string;
}

export interface TeamEventPayload {
  life: number;
  score: number;
  attack: number;
  detail: string;
  attacked_by?: string;
  damage?: number;
}

export interface RefreshRequest {
  refresh: string;
}

export interface RefreshResponse {
  access: string;
  refresh: string;
}