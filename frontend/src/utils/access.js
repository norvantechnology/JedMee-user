import { readAuth } from "../services/authStorage.js";

export function getAccessSnapshot() {
  const auth = readAuth();
  const user = auth?.user || null;
  const access = auth?.access || null;
  const perms = access?.permissions || {};
  // Owner fallback: during first render, access may not be loaded yet.
  // If backend marks account ownership via account_id === user.id, treat as owner optimistically.
  const isOwner =
    Boolean(access?.isAccountOwner) ||
    (user?.account_id && user?.id && String(user.account_id) === String(user.id));
  return { isOwner, perms };
}

export function can(resource, action) {
  const { isOwner, perms } = getAccessSnapshot();
  if (isOwner) return true;
  const r = String(resource || "").toUpperCase();
  const a = String(action || "").toUpperCase();
  return Boolean(perms?.[r]?.[a]);
}

