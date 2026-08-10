import { useMutation } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { authService } from "@/services/auth.service";
import type { SignupResponse, SignupRequest, SignupErrorResponse } from "@/types/auth";


export function useSignup() {
  return useMutation<
    SignupResponse,
    AxiosError<SignupErrorResponse>,
    SignupRequest
  >({
    mutationFn: async (data) => {
      const response = await authService.signup(data);
      return response.data;
    },
  });
}