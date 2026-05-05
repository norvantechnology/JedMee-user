import { InlineButtonProgress } from "../components/ui/buttons.jsx";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { readAuth, saveAuthUser } from "../services/authStorage.js";
import { changeMyPassword } from "../services/accessService.js";
import { emitToast } from "../services/toastBus.js";
import { parseApiError } from "../utils/api.js";
import "./ForceChangePasswordPage.css";
import { IconAuthLock } from "../components/ui/AppIcons.jsx";
import { useSeoMeta } from "../utils/seo.js";

export default function ForceChangePasswordPage() {
  const navigate = useNavigate();
  useSeoMeta({ title: "Set New Password" });
  const auth = readAuth();
  const user = auth?.user || null;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth?.refreshToken) {
      navigate("/login", { replace: true });
      return;
    }
    if (user && !user.must_change_password) {
      navigate("/dashboard", { replace: true });
    }
  }, [auth?.refreshToken, user?.must_change_password, navigate]);

  return (
    <div className="authBody fcpPage">
      <div className="wrapper">
        <div className="fcpCard">
          <div className="fcpHeader">
            <div className="fcpTitle">Update your password</div>
            <div className="fcpSub">This is required on your first login for security.</div>
          </div>

          <form
            className="fcpForm"
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
                const fresh = { ...(user || {}), must_change_password: false };
                saveAuthUser(fresh);
                emitToast({ type: "success", message: "Password updated." });
                navigate("/dashboard", { replace: true });
              } else {
                // 401 errors are auto-toasted by apiClient (avoid double toasts).
                if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
              }
              setBusy(false);
            }}
          >
            <div className="fcpField">
              <label>Current password <span className="reqMark" aria-hidden="true">*</span></label>
              <div className="fcpInputWrap">
                <IconAuthLock className="fcpIco" />
                <input name="currentPassword" type="password" autoComplete="current-password" placeholder="Enter current password" />
              </div>
            </div>

            <div className="fcpField">
              <label>New password <span className="reqMark" aria-hidden="true">*</span></label>
              <div className="fcpInputWrap">
                <IconAuthLock className="fcpIco" />
                <input name="newPassword" type="password" autoComplete="new-password" placeholder="Create a new password" />
              </div>
            </div>

            <div className="fcpField">
              <label>Confirm new password <span className="reqMark" aria-hidden="true">*</span></label>
              <div className="fcpInputWrap">
                <IconAuthLock className="fcpIco" />
                <input name="confirmPassword" type="password" autoComplete="new-password" placeholder="Re-enter new password" />
              </div>
            </div>

            <button className="fcpBtn" type="submit" disabled={busy}>
              {busy ? <InlineButtonProgress label="Updating…" /> : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

