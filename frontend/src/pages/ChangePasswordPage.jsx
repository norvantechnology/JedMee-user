import { InlineButtonProgress } from "../components/ui/buttons.jsx";
import { useState } from "react";
import AppShell from "../layouts/AppShell.jsx";
import { readAuth, saveAuthUser } from "../services/authStorage.js";
import { changeMyPassword } from "../services/accessService.js";
import { emitToast } from "../services/toastBus.js";
import { parseApiError } from "../utils/api.js";
import "./ChangePasswordPage.css";
import { useSeoMeta } from "../utils/seo.js";

export default function ChangePasswordPage() {
  useSeoMeta({ title: "Change Password" });
  const auth = readAuth();
  const user = auth?.user || null;
  const [busy, setBusy] = useState(false);

  return (
    <AppShell
     
      userName={user?.full_name || "User"}
      userEmail={user?.email || auth?.email || ""}
      userBusinessName={user?.firm_name || ""}
      userGstNumber={user?.gst_number || ""}
      variant="user"
    >
      <div className="cpWrap">
        <div className="cpCard">
          <div className="cpTitle">Change password</div>
          <div className="cpSub">For security, you must change your password before continuing.</div>

          <form
            className="cpForm"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const currentPassword = String(form.currentPassword.value || "");
              const newPassword = String(form.newPassword.value || "");
              const confirmPassword = String(form.confirmPassword.value || "");

              if (!currentPassword) return emitToast({ type: "error", message: "Current password is required." });
              if (newPassword.length < 8) return emitToast({ type: "error", message: "New password must be at least 8 characters." });
              if (newPassword !== confirmPassword) return emitToast({ type: "error", message: "Passwords do not match." });

              setBusy(true);
              const resp = await changeMyPassword({ currentPassword, newPassword });
              if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
                // Clear must_change_password locally
                const fresh = { ...(user || {}), must_change_password: false };
                saveAuthUser(fresh);
                emitToast({ type: "success", message: "Password updated." });
              } else {
                // 401 errors are auto-toasted by apiClient (avoid double toasts).
                if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
              }
              setBusy(false);
            }}
          >
            <div className="cpField">
              <label>Current password </label>
              <input name="currentPassword" type="password" autoComplete="current-password" />
            </div>
            <div className="cpField">
              <label>New password </label>
              <input name="newPassword" type="password" autoComplete="new-password" />
            </div>
            <div className="cpField">
              <label>Confirm new password </label>
              <input name="confirmPassword" type="password" autoComplete="new-password" />
            </div>

            <button className="cpBtn" type="submit" disabled={busy}>
              {busy ? <InlineButtonProgress label="Updating…" /> : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}

