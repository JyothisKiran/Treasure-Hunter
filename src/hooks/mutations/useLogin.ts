import { useMutation } from "@tanstack/react-query";
import type { ApiError } from "@/api/client";

import { authService } from "@/services/auth.service";
import type { LoginResponse, LoginRequest, LoginErrorResponse } from "@/types/auth";

export function useLogin() {
  return useMutation<
    LoginResponse,
    ApiError<LoginErrorResponse>,
    LoginRequest
  >({
    mutationFn: async (data) => {
      const response = await authService.login(data);
      return response.data;
    },
  });
}