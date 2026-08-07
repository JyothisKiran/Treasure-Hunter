import { useMutation } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { authService } from "@/services/auth.service";
import type { SignupResponse, SignupRequest } from "@/types/auth";


export function useSignup() {
  return useMutation<
    SignupResponse,
    AxiosError,
    SignupRequest
  >({
    mutationFn: async (data) => {
      const response = await authService.signup(data);
      return response.data;
    },
  });
}