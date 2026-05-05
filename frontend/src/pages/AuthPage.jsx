import { InlineButtonProgress } from "../components/ui/buttons.jsx";
import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { login } from "../services/authService.js";
import { emitToast } from "../services/toastBus.js";
import { saveAuth, saveAuthUser } from "../services/authStorage.js";
import { parseApiError } from "../utils/api.js";
import { isEmailLike, normalizePhoneDigits } from "../utils/validation.js";
import { APP_DISPLAY_NAME, signInSubtitle } from "../constants/brand.js";
import "./AuthPage.css";
import { IconAuthEye, IconAuthLock, IconAuthMail, IconPlus, ShieldCheck } from "../components/ui/AppIcons.jsx";

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = useMemo(() => (location.pathname.includes("register") ? "register" : "login"), [location.pathname]);

  const [loginPwVisible, setLoginPwVisible] = useState(false);
  const [role, setRole] = useState("WHOLESALER");
  const [busy, setBusy] = useState(false);
  // Registration happens on /register

  const onSwitchTab = (tab) => {
    if (tab === "login") navigate("/login");
    else navigate("/register");
  };

  const onPickRole = (r) => {
    setRole(r);
  };
  const sanitizePhoneInput = (e) => {
    const el = e.currentTarget;
    const digits = normalizePhoneDigits(el.value).slice(0, 15);
    if (el.value !== digits) el.value = digits;
  };

  const onRipple = (e) => {
    const btn = e.currentTarget;
    const r = document.createElement("span");
    r.className = "ripple";
    const size = Math.max(btn.offsetWidth, btn.offsetHeight);
    r.style.width = `${size}px`;
    r.style.height = `${size}px`;
    r.style.left = `${btn.offsetWidth / 2 - size / 2}px`;
    r.style.top = `${btn.offsetHeight / 2 - size / 2}px`;
    btn.appendChild(r);
    window.setTimeout(() => r.remove(), 600);
  };

  return (
    <div className="authBody authPage">
      <div className="wrapper">
        <div className="card" id="main-card">
          <div className="card-header">
            <div className="logo-row">
              <img src="/logo.png" alt="JedMee" className="auth-logo-img" />
            </div>

            <div className="tabs" role="tablist" aria-label="Authentication tabs">
              <button
                className={`tab ${activeTab === "login" ? "active" : ""}`}
                type="button"
                onClick={() => onSwitchTab("login")}
              >
                Sign in
              </button>
              <button
                className={`tab ${activeTab === "register" ? "active" : ""}`}
                type="button"
                onClick={() => onSwitchTab("register")}
              >
                Create account
              </button>
            </div>
          </div>

          <div className="panels">
            <div className={`panel ${activeTab !== "login" ? "hidden" : ""}`} id="panel-login">
              <div className="form-title">Welcome back</div>
              <p className="form-sub">{signInSubtitle()}</p>

              <div className="roleRow" role="group" aria-label="Select role">
                <button type="button" className={`roleChip ${role === "WHOLESALER" ? "active" : ""}`} onClick={() => onPickRole("WHOLESALER")}>
                  Wholesaler
                </button>
                <button type="button" className={`roleChip ${role === "RETAILER" ? "active" : ""}`} onClick={() => onPickRole("RETAILER")}>
                  Retailer
                </button>
              </div>

              <form
                noValidate
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  const form = e.currentTarget;
                  const email = form.email?.value || "";
                  const password = form.password?.value || "";
                  const rememberMe = Boolean(form.rememberMe?.checked);

                  if (!isEmailLike(email)) {
                    emitToast({ type: "error", message: "Enter a valid email address (example: name@domain.com)." });
                    setBusy(false);
                    return;
                  }
                  if (!password || password.length < 1) {
                    emitToast({ type: "error", message: "Password is required." });
                    setBusy(false);
                    return;
                  }

                  const resp = await login({ role, email, password, rememberMe });
                  if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
                    const t = resp.json?.data?.tokens;
                    const user = resp.json?.data?.user;
                    if (t?.accessToken && t?.refreshToken) {
                      saveAuth({
                        rememberMe: Boolean(t.rememberMe ?? rememberMe),
                        email,
                        accessToken: t.accessToken,
                        accessExpiresInSec: t.accessExpiresInSec,
                        refreshToken: t.refreshToken
                      });
                      if (user) saveAuthUser(user);
                    }
                    if (Boolean(user?.must_change_password)) {
                      navigate("/first-login-change-password", { replace: true });
                    } else {
                    navigate("/dashboard", { replace: true });
                    }
                  } else {
                    const code = resp?.json?.error?.code;
                    if (resp?.status === 403 && code === "EMAIL_NOT_VERIFIED") {
                      const rm = rememberMe ? "1" : "0";
                      navigate(
                        `/verify-otp?email=${encodeURIComponent(email)}&role=${encodeURIComponent(role)}&rememberMe=${rm}`,
                        { replace: true }
                      );
                    } else {
                      // Errors are auto-toasted by apiClient (avoid duplicate toasts here).
                    }
                  }
                  setBusy(false);
                }}
              >
                <div className="field">
                  <label>Email address <span className="reqMark" aria-hidden="true">*</span></label>
                  <div className="input-wrap">
                    <IconAuthMail className="ico" />
                    <input name="email" type="email" placeholder="you@hospital.org" required />
                  </div>
                </div>

                <div className="field">
                  <label>Password <span className="reqMark" aria-hidden="true">*</span></label>
                  <div className="input-wrap">
                    <IconAuthLock className="ico" />
                    <input
                      name="password"
                      type={loginPwVisible ? "text" : "password"}
                      placeholder="Enter your password"
                      required
                      autoComplete="current-password"
                    />
                    <button className="eye-btn" type="button" onClick={() => setLoginPwVisible((v) => !v)} aria-label="Toggle password visibility">
                      <IconAuthEye />
                    </button>
                  </div>
                </div>

                <div className="between-row">
                  <label className="check-label">
                    <input name="rememberMe" type="checkbox" /> <span>Remember me</span>
                  </label>
                  <Link className="link-btn" to="/forgot-password">
                    Forgot password?
                  </Link>
                </div>

                <button className="submit-btn" type="submit" onClick={onRipple}>
                  {busy ? <InlineButtonProgress label="Signing in..." /> : "Sign in"}
                </button>
              </form>
            </div>

            <div className={`panel ${activeTab !== "register" ? "hidden" : ""}`} id="panel-register">
              <div className="form-title">Create account</div>
              <p className="form-sub">Upload documents and submit for approval.</p>

              <button className="submit-btn" type="button" onClick={() => navigate("/register")}>
                Continue to registration
              </button>

              <div className="footerLinks" style={{ marginTop: 14, textAlign: "center" }}>
                <Link className="link-btn" to="/login">
                  Back to sign in
                </Link>
              </div>
            </div>
          </div>

          <div className="card-footer">
            <div className="secure">
              <ShieldCheck aria-hidden="true" size={18} strokeWidth={2.2} />
              Secured with 256-bit TLS encryption
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

