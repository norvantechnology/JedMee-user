import { refresh } from "./authService.js";
import { clearAuth, hasValidAccessToken, readAuth, saveAuth } from "./authStorage.js";

export async function bootstrapAuth() {
  const auth = readAuth();
  if (!auth?.refreshToken || !auth?.email) return { ok: false };

  if (hasValidAccessToken(auth)) return { ok: true };

  const resp = await refresh({ email: auth.email, refreshToken: auth.refreshToken });
  if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
    const data = resp.json?.data || {};
    saveAuth({
      rememberMe: Boolean(auth.rememberMe),
      email: auth.email,
      accessToken: data.accessToken,
      accessExpiresInSec: data.accessExpiresInSec,
      refreshToken: data.refreshToken
    });
    return { ok: true };
  }

  clearAuth();
  return { ok: false };
}

