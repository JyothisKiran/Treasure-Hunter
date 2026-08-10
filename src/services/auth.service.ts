import { apiClient, ENDPOINTS } from "@/api";
import type { LoginRequest, LoginResponse, MeResponse, RefreshRequest, RefreshResponse, SignupRequest, SignupResponse } from "@/types/auth";


export const authService = {
  login(data: LoginRequest) {
    return apiClient.post<LoginResponse>(
      ENDPOINTS.LOGIN,
      data
    );
  },

  signup(data: SignupRequest) {
    return apiClient.post<SignupResponse>(
      ENDPOINTS.SIGNUP,
      data
    );
  },

  getMe() {
    return apiClient.get<MeResponse>(ENDPOINTS.ME);
  },

  refreshToken(data: RefreshRequest) {
    return apiClient.post<RefreshResponse>(ENDPOINTS.REFRESH, data);
  },
};