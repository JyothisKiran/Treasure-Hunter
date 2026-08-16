import { pb, request, toApiError, type ApiResponse } from "@/api/client";
import { ENDPOINTS, USERS_COLLECTION } from "@/api/endpoints";
import type {
  LoginErrorResponse,
  LoginRequest,
  LoginResponse,
  MeResponse,
  SignupErrorResponse,
  SignupRequest,
  SignupResponse,
} from "@/types/auth";

/** PocketBase reports validation failures per field as
 * `{ data: { email: { code, message } } }`; the UI reads Django/DRF's
 * `{ email: ["..."] }`, so the two are mapped here. */
function mapSignupErrors(body: Record<string, unknown>, message: string): SignupErrorResponse {
  const fields = (body.data ?? {}) as Record<string, { message?: string } | undefined>;
  const pick = (name: string) => {
    const fieldMessage = fields[name]?.message;
    return fieldMessage ? [fieldMessage] : undefined;
  };

  return {
    email: pick("email"),
    password: pick("password"),
    // PocketBase's name for what the old API called re_password.
    re_password: pick("passwordConfirm"),
    detail: message,
  };
}

export const authService = {
  /** Authenticating also saves the token into pb.authStore, so every later
   * request is authorized without any interceptor of our own. */
  async login(data: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    try {
      const result = await pb.collection(USERS_COLLECTION).authWithPassword(data.email, data.password);
      return { data: { access: result.token }, status: 200 };
    } catch (error) {
      throw toApiError<LoginErrorResponse>(error, (_body, message) => ({ detail: message }));
    }
  },

  async signup(data: SignupRequest): Promise<ApiResponse<SignupResponse>> {
    try {
      const record = await pb.collection(USERS_COLLECTION).create({
        email: data.email,
        password: data.password,
        passwordConfirm: data.re_password,
      });
      return { data: { id: record.uid, email: record.email }, status: 200 };
    } catch (error) {
      throw toApiError<SignupErrorResponse>(error, mapSignupErrors);
    }
  },

  getMe() {
    return request<MeResponse>(ENDPOINTS.ME);
  },
};
