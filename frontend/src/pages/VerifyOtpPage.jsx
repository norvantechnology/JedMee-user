import { InlineButtonProgress } from "../components/ui/buttons.jsx";
import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSeoMeta } from "../utils/seo.js";
import { requestOtp, verifyOtp } from "../services/authService.js";
import { emitToast } from "../services/toastBus.js";
import { saveAuth, saveAuthUser } from "../services/authStorage.js";
import { parseApiError } from "../utils/api.js";
import { otpRequestSuccessMessage } from "../utils/authUiMessages.js";
import { isEmailLike } from "../utils/validation.js";
import { APP_DISPLAY_NAME } from "../constants/brand.js";
import "./VerifyOtpPage.css";
import { IconAuthLock } from "../components/ui/AppIcons.jsx";

export default function VerifyOtpPage() {
  const location = useLocation();
  const navigate = useNavigate();

  useSeoMeta({
    title: "Verify Your Email",
    description:
      "Enter the one-time password sent to your email to verify your JedMee account and complete sign-up.",
  });

  const emailFromQuery = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get("email") || "";
  }, [location.search]);

  const roleFromQuery = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return (sp.get("role") || "").toUpperCase();
  }, [location.search]);

  const rememberMeFromQuery = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get("rememberMe") === "1" || sp.get("rememberMe") === "true";
  }, [location.search]);

  const [email] = useState(emailFromQuery);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);

  const maskedEmail = useMemo(() => {
    const [local, domain] = String(emailFromQuery || "").split("@");
    if (!local || !domain) return emailFromQuery;
    const head = local.slice(0, 2);
    return `${head}${"*".repeat(Math.max(0, local.length - 2))}@${domain}`;
  }, [emailFromQuery]);
  const isOtpValid = (v) => /^\d{6}$/.test(String(v || "").trim());

  return (
    <div className="authBody verifyOtpPage">
      <div className="wrapper">
        <div className="card">
          <div className="card-header">
            <img src="/logo.png" alt="JedMee" className="auth-logo-img" />
          </div>

          <div className="panel">
            <div className="form-title">Verify email</div>
            <p className="form-sub">Enter the 6-digit code sent to <span className="emailText">{maskedEmail}</span>.</p>

            <form
              noValidate
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                if (!isEmailLike(email)) {
                  emitToast({ type: "error", message: "Email is missing or invalid. Please go back to signup." });
                  setBusy(false);
                  return;
                }
                if (!isOtpValid(otp)) {
                  emitToast({ type: "error", message: "OTP must be 6 digits." });
                  setBusy(false);
                  return;
                }
                const resp = await verifyOtp({ email, otp });
                if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
                  const t = resp.json?.data?.tokens;
                  const user = resp.json?.data?.user;
                  if (t?.accessToken && t?.refreshToken) {
                    saveAuth({
                      rememberMe: Boolean(t.rememberMe ?? rememberMeFromQuery),
                      email,
                      accessToken: t.accessToken,
                      accessExpiresInSec: t.accessExpiresInSec,
                      refreshToken: t.refreshToken
                    });
                    if (user) saveAuthUser(user);
                  }
                  emitToast({ type: "success", message: "Email verified! Your account is being reviewed." });
                  // Navigate based on account status — PENDING/REJECTED/BLOCKED go to approval gate.
                  const status = String(user?.status || "").toUpperCase();
                  const isBlocked = Boolean(user?.is_blocked);
                  if (isBlocked || status === "PENDING" || status === "REJECTED") {
                    navigate("/approval", { replace: true });
                  } else if (Boolean(user?.must_change_password)) {
                    navigate("/first-login-change-password", { replace: true });
                  } else {
                    navigate("/dashboard", { replace: true });
                  }
                } else {
                  emitToast({ type: "error", message: parseApiError(resp) });
                }
                setBusy(false);
              }}
            >
              <div className="field">
                <label>OTP <span className="reqMark" aria-hidden="true">*</span></label>
                <div className="input-wrap">
                  <IconAuthLock />
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      const digits = String(el.value || "").replace(/\D+/g, "").slice(0, 6);
                      if (el.value !== digits) el.value = digits;
                      if (otp !== digits) setOtp(digits);
                    }}
                    placeholder="000000"
                    inputMode="numeric"
                    maxLength={6}
                    required
                  />
                </div>
                <div className="otpHint">Enter the code from your email. You can resend if it expired.</div>
              </div>

              <div className="otpActions">
                <button
                  className="otpBtn"
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const resp = await requestOtp({ email, role: roleFromQuery });
                    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
                      emitToast({ type: "success", message: otpRequestSuccessMessage(resp.json?.meta) });
                    } else {
                      emitToast({ type: "error", message: parseApiError(resp) });
                    }
                    setBusy(false);
                  }}
                >
                  {busy ? <InlineButtonProgress label="Sending..." /> : "Resend OTP"}
                </button>
                <button className="submit-btn" type="submit" disabled={busy}>
                  {busy ? <InlineButtonProgress label="Verifying..." /> : "Verify & continue"}
                </button>
              </div>
            </form>

            <div className="footerLinks">
              <Link className="link-btn" to="/login">
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

