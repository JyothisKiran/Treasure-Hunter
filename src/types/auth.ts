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