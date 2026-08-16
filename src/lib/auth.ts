import { pb } from "@/api/client";

// The auth token lives in PocketBase's own auth store, which persists it to
// localStorage and keeps it in sync with every auth/refresh call the SDK makes.
// These helpers are the rest of the app's view of it.

export function getAccessToken() {
  return pb.authStore.token || null;
}

export function setTokens({ access }: { access: string }) {
  if (access !== pb.authStore.token) {
    pb.authStore.save(access, pb.authStore.record);
  }
}

export function clearTokens() {
  pb.authStore.clear();
}
