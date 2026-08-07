import { useMutation } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { authService } from "@/services/auth.service";
import type { LoginResponse, LoginRequest } from "@/types/auth";

export function useLogin() {
  return useMutation<
    LoginResponse,
    AxiosError,
    LoginRequest
  >({
    mutationFn: async (data) => {
      const response = await authService.login(data);
      return response.data;
    },
  });
}