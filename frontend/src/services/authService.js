import { apiPost } from "./apiClient.js";

export async function signup(payload) {
  return await apiPost("/auth/signup", payload);
}

export async function login(payload) {
  return await apiPost("/auth/login", payload);
}

export async function refresh(payload) {
  // Refresh should be silent (no toast) unless you want it.
  return await apiPost("/auth/refresh", payload, { toast: "none" });
}

export async function logout(payload) {
  return await apiPost("/auth/logout", payload, { toast: "none" });
}

export async function requestOtp(payload) {
  return await apiPost("/auth/otp/request", payload);
}

export async function verifyOtp(payload) {
  return await apiPost("/auth/otp/verify", payload);
}

export async function forgotPasswordRequest(payload) {
  return await apiPost("/auth/password/forgot/request", payload, { toast: "none" });
}

export async function forgotPasswordResend(payload) {
  return await apiPost("/auth/password/forgot/resend", payload, { toast: "none" });
}

export async function forgotPasswordReset(payload) {
  return await apiPost("/auth/password/forgot/reset", payload, { toast: "none" });
}

