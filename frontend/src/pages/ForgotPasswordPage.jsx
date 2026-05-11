import { InlineButtonProgress } from "../components/ui/buttons.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSeoMeta } from "../utils/seo.js";
import { forgotPasswordRequest, forgotPasswordResend, forgotPasswordReset } from "../services/authService.js";
import { emitToast } from "../services/toastBus.js";
import { otpExpiresSecondsFromMeta, otpRequestSuccessMessage } from "../utils/authUiMessages.js";
import { isEmailLike } from "../utils/validation.js";
import "./ForgotPasswordPage.css";
import { IconAuthBack, IconAuthEye, IconAuthMail } from "../components/ui/AppIcons.jsx";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  useSeoMeta({
    title: "Reset Your Password",
    description:
      "Forgot your JedMee password? Enter your email to receive a one-time password and reset your account access.",
  });

  const [step, setStep] = useState("email"); // email | reset
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPwVisible, setNewPwVisible] = useState(false);
  const [confirmPwVisible, setConfirmPwVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [secondsLeft]);

  const mmss = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const otpValue = useMemo(() => otpDigits.join(""), [otpDigits]);

  const focusOtp = (idx) => {
    const el = otpRefs.current[idx];
    if (el && typeof el.focus === "function") el.focus();
  };

  const onOtpChange = (idx, raw) => {
    const v = String(raw || "").replace(/\D+/g, "");
    if (!v) {
      setOtpDigits((prev) => {
        const next = [...prev];
        next[idx] = "";
        return next;
      });
      return;
    }

    if (v.length === 1) {
      setOtpDigits((prev) => {
        const next = [...prev];
        next[idx] = v;
        return next;
      });
      if (idx < 5) focusOtp(idx + 1);
      return;
    }

    // If user pasted multiple digits into one box, spread across.
    const chars = v.slice(0, 6 - idx).split("");
    setOtpDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < chars.length; i += 1) next[idx + i] = chars[i];
      return next;
    });
    focusOtp(Math.min(5, idx + chars.length));
  };

  const onOtpKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !otpDigits[idx] && idx > 0) {
      focusOtp(idx - 1);
    }
    if (e.key === "ArrowLeft" && idx > 0) focusOtp(idx - 1);
    if (e.key === "ArrowRight" && idx < 5) focusOtp(idx + 1);
  };

  const onOtpPaste = (e) => {
    const text = e.clipboardData?.getData("text") || "";
    const digits = String(text).replace(/\D+/g, "").slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    const arr = digits.split("");
    setOtpDigits([arr[0] || "", arr[1] || "", arr[2] || "", arr[3] || "", arr[4] || "", arr[5] || ""]);
    focusOtp(Math.min(5, digits.length - 1));
  };

  const onRequestOtp = async (e) => {
    e.preventDefault();
    const em = String(email || "").trim();
    if (!isEmailLike(em)) {
      emitToast({ type: "error", message: "Enter a valid email address (example: name@domain.com)." });
      return;
    }

    setBusy(true);
    const resp = await forgotPasswordRequest({ email: em });
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      setStep("reset");
      setSecondsLeft(otpExpiresSecondsFromMeta(resp.json?.meta));
      emitToast({ type: "success", message: otpRequestSuccessMessage(resp.json?.meta) });
      setOtpDigits(["", "", "", "", "", ""]);
      window.setTimeout(() => focusOtp(0), 0);
    } else {
      emitToast({ type: "error", message: resp?.json?.error?.message || "Request failed" });
      setStep("email");
    }
    setBusy(false);
  };

  const onResend = async () => {
    const em = String(email || "").trim();
    if (!isEmailLike(em)) {
      emitToast({ type: "error", message: "Enter a valid email address." });
      return;
    }
    setBusy(true);
    const resp = await forgotPasswordResend({ email: em });
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      setSecondsLeft(otpExpiresSecondsFromMeta(resp.json?.meta));
      emitToast({ type: "success", message: otpRequestSuccessMessage(resp.json?.meta) });
      setOtpDigits(["", "", "", "", "", ""]);
      window.setTimeout(() => focusOtp(0), 0);
    } else {
      emitToast({ type: "error", message: resp?.json?.error?.message || "Request failed" });
    }
    setBusy(false);
  };

  const onReset = async (e) => {
    e.preventDefault();

    const em = String(email || "").trim();
    const o = String(otpValue || "").trim();
    if (!isEmailLike(em)) {
      emitToast({ type: "error", message: "Enter a valid email address." });
      return;
    }
    if (!/^\d{6}$/.test(o)) {
      emitToast({ type: "error", message: "OTP must be 6 digits." });
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      emitToast({ type: "error", message: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      emitToast({ type: "error", message: "Confirm password does not match." });
      return;
    }

    setBusy(true);
    const resp = await forgotPasswordReset({ email: em, otp: o, newPassword });
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      window.setTimeout(() => navigate("/login", { replace: true }), 700);
    } else {
      emitToast({ type: "error", message: resp?.json?.error?.message || "Reset failed" });
    }
    setBusy(false);
  };

  return (
    <div className="authBody">
      <div className="wrapper">
        <div className="forgot-card">
          <div className="forgot-header">
            <h3>Forgot password?</h3>
            <p>{step === "email" ? "We'll send an OTP to your email" : "Enter OTP and set a new password"}</p>
          </div>
          <div className="forgot-body">
            <Link className="back-btn" to="/login">
              <IconAuthBack />
              Back to sign in
            </Link>

            {step === "email" ? (
              <form noValidate onSubmit={onRequestOtp}>
                <div className="field">
                  <label>Email address </label>
                  <div className="input-wrap">
                    <span className="ico" aria-hidden="true"><IconAuthMail /></span>
                    <input
                      type="email"
                      placeholder="you@hospital.org"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <button className="submit-btn" type="submit">
                  {busy ? <InlineButtonProgress label="Sending..." /> : "Send OTP"}
                </button>
              </form>
            ) : (
              <form noValidate onSubmit={onReset}>
                <div className="field">
                  <label>OTP </label>
                  <div className="otpBoxes" role="group" aria-label="OTP input">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          otpRefs.current[idx] = el;
                        }}
                        className="otpBox"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        aria-label={`OTP digit ${idx + 1}`}
                        value={otpDigits[idx]}
                        onChange={(e) => onOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => onOtpKeyDown(idx, e)}
                        onPaste={onOtpPaste}
                        maxLength={1}
                        required
                      />
                    ))}
                  </div>
                  <div className="fpMetaRow">
                    <div className="fpTimer">Valid for {mmss(secondsLeft)}</div>
                    <button className="fpLinkBtn" type="button" onClick={onResend} disabled={busy}>
                      Resend OTP
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label>New password </label>
                  <div className="input-wrap">
                    <input
                      className="fpInput fpPwInput"
                      type={newPwVisible ? "text" : "password"}
                      placeholder="Create a new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={8}
                      required
                      autoComplete="new-password"
                    />
                    <button
                      className="fpEyeBtn"
                      type="button"
                      aria-label="Toggle new password visibility"
                      onClick={() => setNewPwVisible((v) => !v)}
                    >
                      <IconAuthEye />
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label>Confirm password </label>
                  <div className="input-wrap">
                    <input
                      className="fpInput fpPwInput"
                      type={confirmPwVisible ? "text" : "password"}
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={8}
                      required
                      autoComplete="new-password"
                    />
                    <button
                      className="fpEyeBtn"
                      type="button"
                      aria-label="Toggle confirm password visibility"
                      onClick={() => setConfirmPwVisible((v) => !v)}
                    >
                      <IconAuthEye />
                    </button>
                  </div>
                </div>

                <button className="submit-btn" type="submit" disabled={busy}>
                  {busy ? <InlineButtonProgress label="Resetting..." /> : "Reset password"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

