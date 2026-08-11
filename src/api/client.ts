import axios, { type AxiosRequestConfig } from "axios";

import { ENDPOINTS } from "./endpoints";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "@/lib/auth";
import type { RefreshResponse } from "@/types/auth";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const accessToken = getAccessToken();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

function logout() {
  clearTokens();
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  refreshPromise ??= (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    try {
      const { data } = await axios.post<RefreshResponse>(
        `${import.meta.env.VITE_API_BASE_URL}${ENDPOINTS.REFRESH}`,
        { refresh: refreshToken }
      );
      setTokens(data);
      return data.access;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthRequest =
      originalRequest?.url === ENDPOINTS.REFRESH || originalRequest?.url === ENDPOINTS.LOGIN;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthRequest) {
      originalRequest._retry = true;
      const newAccessToken = await refreshAccessToken();

      if (newAccessToken) {
        originalRequest.headers = {
          ...originalRequest.headers,
          Authorization: `Bearer ${newAccessToken}`,
        };
        return apiClient(originalRequest);
      }

      logout();
    }

    return Promise.reject(error);
  }
);