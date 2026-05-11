import { AppButton, InlineButtonProgress } from "../components/ui/buttons.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrency } from "../context/CurrencyContext.jsx";
import { CURRENCY_LIST } from "../utils/currency.js";
import { useLocale } from "../context/LocaleContext.jsx";
import { COUNTRIES } from "../utils/locale.js";
import CountrySelector from "../components/ui/CountrySelector.jsx";
import { useSeoMeta } from "../utils/seo.js";
import { Link, useLocation, useNavigate } from "react-router-dom";
import DocumentUploadField from "../components/DocumentUploadField.jsx";
import { login, requestOtp } from "../services/authService.js";
import { registerUser } from "../services/registrationService.js";
import { saveAuth, saveAuthUser } from "../services/authStorage.js";
import { emitToast } from "../services/toastBus.js";
import { APP_DISPLAY_NAME, signInSubtitle } from "../constants/brand.js";
import { parseApiError } from "../utils/api.js";
import { otpRequestSuccessMessage } from "../utils/authUiMessages.js";
import { isCountryCodeLike, isEmailLike, isPhoneDigitsValid, normalizePhoneDigits } from "../utils/validation.js";
import {
  Building2,
  BadgeCheck,
  Lock,
  ShieldCheck,
  Truck,
  Store,
  IconAuthEye,
  IconAuthLock,
  IconAuthMail,
  IconPlus
} from "../components/ui/AppIcons.jsx";
import "./AuthUnifiedPage.css";

/* ── 3D Floating icon cards for left panel ── */
function FloatingIcons() {
  const cards = [
    {
      cls: "auFC1",
      bg: "rgba(99,199,119,0.22)",
      iconBg: "rgba(99,199,119,0.35)",
      color: "#7ef59a",
      label: "Today's Sales",
      value: "₹1,24,800",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      ),
    },
    {
      cls: "auFC2",
      bg: "rgba(99,149,255,0.22)",
      iconBg: "rgba(99,149,255,0.35)",
      color: "#9fb8ff",
      label: "Purchase Orders",
      value: "38 pending",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
        </svg>
      ),
    },
    {
      cls: "auFC3",
      bg: "rgba(255,185,95,0.22)",
      iconBg: "rgba(255,185,95,0.35)",
      color: "#ffd58a",
      label: "Net Profit",
      value: "+₹18,240",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
        </svg>
      ),
    },
    {
      cls: "auFC4",
      bg: "rgba(240,100,120,0.22)",
      iconBg: "rgba(240,100,120,0.35)",
      color: "#ff9aaa",
      label: "Inventory",
      value: "1,240 items",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
      ),
    },
    {
      cls: "auFC5",
      bg: "rgba(175,100,255,0.22)",
      iconBg: "rgba(175,100,255,0.35)",
      color: "#d0a8ff",
      label: "Billing",
      value: "12 invoices",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="auFloatingIcons" aria-hidden="true">
      {cards.map((c) => (
        <div
          key={c.cls}
          className={`auFloatCard ${c.cls}`}
          style={{ background: c.bg, borderColor: "rgba(255,255,255,0.16)" }}
        >
          <div
            className="auFCIcon"
            style={{ background: c.iconBg, color: c.color }}
          >
            {c.icon}
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>{c.label}</span>
            <span style={{ display: "block", fontSize: "13.5px", fontWeight: 800, color: "#fff", marginTop: "1px" }}>{c.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Stepper({ step }) {
  const s = Math.max(1, Math.min(4, Number(step || 1)));
  const dots = [1, 2, 3, 4];
  return (
    <div className="auStepIndicator" aria-label={`Step ${s} of 4`}>
      {dots.map((i, idx) => (
        <>
          <div
            key={i}
            className={`auStepDot ${i === s ? "active" : i < s ? "done" : ""}`.trim()}
          >
            {i < s ? "✓" : i}
          </div>
          {idx < dots.length - 1 && (
            <div key={`l_${i}`} className={`auStepLine ${i < s ? "done" : ""}`.trim()} />
          )}
        </>
      ))}
    </div>
  );
}

function RoleCard({ id, selected, onClick, icon, title, subtitle }) {
  return (
    <label className={`auRoleCard ${selected ? "selected" : ""}`.trim()} htmlFor={id} onClick={onClick}>
      <input id={id} type="radio" checked={selected} readOnly />
      <span className="auRoleIcon" aria-hidden="true">{icon}</span>
      <span className="auRoleText">
        <span className="auRoleLabel">{title}</span>
        <span className="auRoleDesc">{subtitle}</span>
      </span>
    </label>
  );
}

export default function AuthUnifiedPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = useMemo(
    () => (location.pathname.includes("register") ? "register" : "login"),
    [location.pathname]
  );

  useSeoMeta({
    title: activeTab === "register" ? "Create Your Account" : "Sign In",
    description:
      activeTab === "register"
        ? "Create your JedMee account and start managing your pharmacy or distribution business with tax billing, stock tracking, and more."
        : "Sign in to JedMee — your all-in-one pharmacy management platform for stock, billing, orders, and payments.",
  });

  // ── Login state ──
  const [loginRole, setLoginRole] = useState("WHOLESALER");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginRemember, setLoginRemember] = useState(true);
  const [loginPwVisible, setLoginPwVisible] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);

  // ── Register state ──
  const { setCurrency } = useCurrency();
  const { setCountry, taxIdLabel } = useLocale();
  const [regRole, setRegRole] = useState("WHOLESALER");
  const [regStep, setRegStep] = useState(1);
  const [regBusy, setRegBusy] = useState(false);
  const [regPwVisible, setRegPwVisible] = useState(false);
  const [regCountry, setRegCountry] = useState("IN");
  const [regCurrency, setRegCurrency] = useState("INR");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const phoneDigits = useMemo(() => normalizePhoneDigits(phoneNumber), [phoneNumber]);
  const [password, setPassword] = useState("");

  const [firmName, setFirmName] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [address, setAddress] = useState("");

  const [gstNumber, setGstNumber] = useState("");
  const [dl1Number, setDl1Number] = useState("");
  const [dl2Number, setDl2Number] = useState("");

  const [gstCertificateUrl, setGstCertificateUrl] = useState("");
  const [drugLicense1Url, setDrugLicense1Url] = useState("");
  const [drugLicense2Url, setDrugLicense2Url] = useState("");

  useEffect(() => {
    if (activeTab !== "register") return;
    setRegStep((s) => Math.max(1, Math.min(4, Number(s || 1))));
  }, [activeTab]);

  // Reset all registration fields when the user switches role
  const isFirstRoleMount = useRef(true);
  useEffect(() => {
    if (isFirstRoleMount.current) {
      isFirstRoleMount.current = false;
      return;
    }
    setFullName("");
    setEmail("");
    setCountryCode("+91");
    setPhoneNumber("");
    setPassword("");
    setFirmName("");
    setPinCode("");
    setCity("");
    setState("");
    setAddress("");
    setGstNumber("");
    setDl1Number("");
    setDl2Number("");
    setGstCertificateUrl("");
    setDrugLicense1Url("");
    setDrugLicense2Url("");
    setRegCountry("IN");
    setRegCurrency("INR");
    setRegStep(1);
  }, [regRole]);

  function onSwitchTab(tab) {
    if (tab === "login") navigate("/login");
    else navigate("/register");
  }

  function validateRegStep(step) {
    const s = Number(step || 1);
    if (s === 1) {
      if (!fullName.trim() || fullName.trim().length < 2) return "Full name must be at least 2 characters.";
      if (!isEmailLike(email)) return "Enter a valid email address.";
      if (!isCountryCodeLike(countryCode)) return "Select a valid country code.";
      if (!isPhoneDigitsValid(phoneDigits)) return "Phone number must be 7 to 15 digits.";
      if (!password || password.length < 8) return "Password must be at least 8 characters.";
    }
    if (s === 2) {
      if (!firmName.trim()) return "Firm name is required.";
      if (!/^\d{6}$/.test(String(pinCode || ""))) return "Pin code must be 6 digits.";
      if (!city.trim()) return "City is required.";
      if (!state.trim()) return "State is required.";
      if (!address.trim()) return "Address is required.";
    }
    if (s === 3) {
      if (!gstNumber.trim() || gstNumber.trim().length !== 15) return `${taxIdLabel} must be 15 characters.`;
      if (!dl1Number.trim()) return "Drug license 1 number is required.";
      if (!dl2Number.trim()) return "Drug license 2 number is required.";
    }
    if (s === 4) {
      if (!gstCertificateUrl) return `${taxIdLabel} certificate is required.`;
      if (!drugLicense1Url) return "Drug license 1 is required.";
      if (!drugLicense2Url) return "Drug license 2 is required.";
    }
    return "";
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    if (loginBusy) return;
    if (!isEmailLike(loginEmail)) {
      emitToast({ type: "error", message: "Enter a valid email address (example: name@domain.com)." });
      return;
    }
    if (!loginPassword) {
      emitToast({ type: "error", message: "Password is required." });
      return;
    }

    setLoginBusy(true);
    try {
      const resp = await login({ role: loginRole, email: loginEmail, password: loginPassword, rememberMe: loginRemember });
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      const t = resp.json?.data?.tokens;
      const user = resp.json?.data?.user;
      if (t?.accessToken && t?.refreshToken) {
        saveAuth({
          rememberMe: Boolean(t.rememberMe ?? loginRemember),
          email: loginEmail,
          accessToken: t.accessToken,
          accessExpiresInSec: t.accessExpiresInSec,
          refreshToken: t.refreshToken,
        });
        if (user) saveAuthUser(user);
      }
      // Navigate based on account status — never send PENDING/REJECTED/BLOCKED to dashboard.
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
      const code = resp?.json?.error?.code;
      if (resp?.status === 403 && code === "EMAIL_NOT_VERIFIED") {
        const rm = loginRemember ? "1" : "0";
        navigate(
          `/verify-otp?email=${encodeURIComponent(loginEmail)}&role=${encodeURIComponent(loginRole)}&rememberMe=${rm}`,
          { replace: true }
        );
      } else {
        emitToast({ type: "error", message: parseApiError(resp) });
      }
    }
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleRegisterSubmit() {
    if (regBusy) return;
    const allMsg = [1, 2, 3, 4].map(validateRegStep).find(Boolean);
    if (allMsg) {
      emitToast({ type: "error", message: allMsg });
      return;
    }
    setRegBusy(true);
    try {
      const resp = await registerUser({
        role: regRole,
        fullName,
        email,
        countryCode,
        phoneNumber: phoneDigits,
        password,
        firmName,
        address,
        pinCode,
        city,
        state,
        gstNumber,
        drugLicense1Number: dl1Number,
        drugLicense2Number: dl2Number,
        gstCertificateUrl,
        drugLicense1Url,
        drugLicense2Url,
      });
      if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
        const otpResp = await requestOtp({ email, role: regRole });
        if (otpResp.status < 200 || !otpResp.json?.ok) {
          emitToast({ type: "error", message: parseApiError(otpResp) });
          return;
        }
        // Apply country + currency preferences chosen during registration
        setCountry(regCountry, false); // false = don't auto-override currency
        setCurrency(regCurrency);
        emitToast({ type: "success", message: otpRequestSuccessMessage(otpResp.json?.meta) });
        navigate(`/verify-otp?email=${encodeURIComponent(email)}&role=${encodeURIComponent(regRole)}`, { replace: true });
      } else {
        const fieldErrors = resp?.json?.error?.details?.fieldErrors;
        if (fieldErrors && typeof fieldErrors === "object") {
          const first = Object.values(fieldErrors).find(Boolean);
          emitToast({ type: "error", message: String(first || "Validation failed") });
        } else {
          emitToast({ type: "error", message: parseApiError(resp) });
        }
      }
    } finally {
      setRegBusy(false);
    }
  }

  function goRegStep(next) {
    const n = Math.max(1, Math.min(4, Number(next || 1)));
    if (n > regStep) {
      const msg = validateRegStep(regStep);
      if (msg) {
        emitToast({ type: "error", message: msg });
        return;
      }
    }
    setRegStep(n);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* ignore */ }
  }

  return (
    <div className="auRoot" aria-label="Authentication">
      {/* ── Left panel ── */}
      <aside className="auLeft" aria-hidden="true">
        <div className="auLeftGrid" />
        <div className="auRing" />
        <div className="auOrb" />

        {/* 3D floating business metric cards */}
        <FloatingIcons />

        <div className="auLeftContent">
          <div className="auLogo">
            <img src="/logo.png" alt="JedMee" className="au-logo-img" />
          </div>
          <h1 className="auHeadline">
            Smarter pharma.
            <br />
            Faster orders.
            <br />
            Zero hassle.
          </h1>
          <p className="auLeftSub">
            Track sales, manage inventory, handle billing — all in one verified platform built for wholesalers and retailers.
          </p>
        </div>

        <div className="auPills">
          <div className="auPill">
            <BadgeCheck size={13} strokeWidth={2.5} />
            Verified businesses
          </div>
          <div className="auPill">
            <Lock size={13} strokeWidth={2.5} />
            Secure sign-in
          </div>
          <div className="auPill">
            <ShieldCheck size={13} strokeWidth={2.5} />
            Compliance-ready
          </div>
          <div className="auPill">
            <Truck size={13} strokeWidth={2.5} />
            Order tracking
          </div>
        </div>
      </aside>

      {/* ── Right panel ── */}
      <main className="auRight">
        <div className="auMobileLogo">
          <div className="auMobileLogoInner">
            <div className="auMobileLogoImgWrap">
              <img src="/logo.png" alt="JedMee" className="au-logo-img" />
            </div>
            <p className="auMobileLogoTagline">Pharmacy management, simplified</p>
          </div>
          <div className="auMobileLogoPills">
            <span className="auMobileLogoPill">Wholesalers</span>
            <span className="auMobileLogoDot" aria-hidden="true" />
            <span className="auMobileLogoPill">Retailers</span>
            <span className="auMobileLogoDot" aria-hidden="true" />
            <span className="auMobileLogoPill">Verified</span>
          </div>
        </div>

        <div className="auCard">
          {/* Tabs */}
          <div className="auTabs" role="tablist" aria-label="Authentication tabs">
            <button
              className={`auTab ${activeTab === "login" ? "active" : ""}`}
              type="button"
              onClick={() => onSwitchTab("login")}
            >
              Sign in
            </button>
            <button
              className={`auTab ${activeTab === "register" ? "active" : ""}`}
              type="button"
              onClick={() => onSwitchTab("register")}
            >
              Create account
            </button>
          </div>

          {/* ── Sign in ── */}
          {activeTab === "login" && (
            <section className="auScreen" aria-label="Sign in">
              <h2 className="auTitle">Welcome back</h2>
              <p className="auSub">{signInSubtitle()}</p>

              <div className="auRoleRow" role="group" aria-label="Select role">
                <RoleCard
                  id="au-login-w"
                  selected={loginRole === "WHOLESALER"}
                  onClick={() => setLoginRole("WHOLESALER")}
                  icon={<Building2 size={17} strokeWidth={2.1} />}
                  title="Wholesaler"
                  subtitle="Distribute & supply"
                />
                <RoleCard
                  id="au-login-r"
                  selected={loginRole === "RETAILER"}
                  onClick={() => setLoginRole("RETAILER")}
                  icon={<Store size={17} strokeWidth={2.1} />}
                  title="Retailer"
                  subtitle="Order & stock"
                />
              </div>

              <form className="auForm" noValidate onSubmit={handleLoginSubmit}>
                <div className="auField">
                  <label className="auLabel" htmlFor="au-login-email">Email address </label>
                  <div className="auInputWrap">
                    <span className="auFieldIcon" aria-hidden="true"><IconAuthMail /></span>
                    <input
                      id="au-login-email"
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="auInput hasIcon"
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="auField">
                  <label className="auLabel" htmlFor="au-login-pass">Password </label>
                  <div className="auInputWrap">
                    <span className="auFieldIcon" aria-hidden="true"><IconAuthLock /></span>
                    <input
                      id="au-login-pass"
                      type={loginPwVisible ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter password"
                      className="auInput hasIcon hasIconRight"
                      autoComplete="current-password"
                    />
                    <button
                      className="auIconBtn"
                      type="button"
                      onClick={() => setLoginPwVisible((v) => !v)}
                      aria-label="Toggle password visibility"
                    >
                      <IconAuthEye />
                    </button>
                  </div>
                </div>

                <div className="auExtrasRow">
                  <label className="auCheckRow">
                    <input
                      type="checkbox"
                      checked={loginRemember}
                      onChange={(e) => setLoginRemember(e.target.checked)}
                    />
                    <span>Remember me</span>
                  </label>
                  <Link className="auLink" to="/forgot-password">Forgot password?</Link>
                </div>

                <AppButton variant="primary" className="auPrimaryBtn" type="submit" disabled={loginBusy}>
                  {loginBusy ? (
                    <InlineButtonProgress label="Signing in…" />
                  ) : (
                    "Sign in"
                  )}
                </AppButton>

                <div className="auSecurity">
                  <ShieldCheck size={13} strokeWidth={2.5} />
                  Secured with 256-bit TLS encryption
                </div>
              </form>
            </section>
          )}

          {/* ── Register (4 steps) ── */}
          {activeTab === "register" && (
            <section className="auScreen" aria-label="Create account">
              <div className="auStepHeader">
                <h2 className="auTitle">
                  {regStep === 1
                    ? "Basic information"
                    : regStep === 2
                    ? "Business information"
                    : regStep === 3
                    ? "Legal & verification"
                    : "Upload documents"}
                </h2>
                <p className="auSub">
                  {regStep === 1 ? (
                    <>Status will be <span className="auPending">PENDING</span> until admin approval.</>
                  ) : regStep === 2 ? (
                    "Firm details used for verification and billing."
                  ) : regStep === 3 ? (
                    "These must be unique for each account."
                  ) : (
                    "Upload clear photos/scans (max 5MB each)."
                  )}
                </p>
                <Stepper step={regStep} />
              </div>

              {/* Step 1 */}
              {regStep === 1 && (
                <>
                  <div className="auRoleRow" role="group" aria-label="Select role">
                    <RoleCard
                      id="au-reg-w"
                      selected={regRole === "WHOLESALER"}
                      onClick={() => setRegRole("WHOLESALER")}
                      icon={<Building2 size={17} strokeWidth={2.1} />}
                      title="Wholesaler"
                      subtitle="Distribute & supply"
                    />
                    <RoleCard
                      id="au-reg-r"
                      selected={regRole === "RETAILER"}
                      onClick={() => setRegRole("RETAILER")}
                      icon={<Store size={17} strokeWidth={2.1} />}
                      title="Retailer"
                      subtitle="Order & stock"
                    />
                  </div>

                  <div className="auSectionCard">
                    <div className="auSectionTitle">Personal details</div>
                    <div className="auSectionSub">Used to identify you and contact you.</div>

                    <div className="auGrid2">
                      <div className="auField">
                        <label className="auLabel">Full name </label>
                        <input
                          className="auInput"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Your full name"
                        />
                      </div>
                      <div className="auField">
                        <label className="auLabel">Password </label>
                        <div className="auInputWrap">
                          <input
                            className="auInput hasIconRight"
                            type={regPwVisible ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Min. 8 characters"
                            autoComplete="new-password"
                          />
                          <button
                            className="auIconBtn"
                            type="button"
                            onClick={() => setRegPwVisible((v) => !v)}
                            aria-label="Toggle password visibility"
                          >
                            <IconAuthEye />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="auField">
                      <label className="auLabel">Email </label>
                      <input
                        className="auInput"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        inputMode="email"
                        type="email"
                        autoComplete="email"
                      />
                    </div>

                    <div className="auField">
                      <label className="auLabel" htmlFor="au-reg-country">
                        Country / Region <span className="auOptional" style={{ fontWeight: 400, color: "var(--color-text-muted)", fontSize: "12px" }}>(optional)</span>
                      </label>
                      <CountrySelector
                        id="au-reg-country"
                        className="auSelect"
                        value={regCountry}
                        showFlag
                        onChange={(code) => {
                          setRegCountry(code);
                          const cfg = COUNTRIES[code];
                          if (cfg) {
                            // Auto-set currency and phone prefix from country
                            setRegCurrency(cfg.currencyCode);
                            setCountryCode(cfg.phoneCode);
                          }
                        }}
                      />
                      <div className="auFieldHint" style={{ marginTop: 5, fontSize: "12px", color: "var(--color-text-muted)" }}>
                        Sets your tax label (GST / VAT / Sales Tax) and default currency.
                      </div>
                    </div>

                    <div className="auField">
                      <label className="auLabel">Phone </label>
                      <div className="auPhoneRow">
                        <select
                          className="auSelect auPhoneCode"
                          value={countryCode}
                          onChange={(e) => setCountryCode(e.target.value)}
                        >
                          {Object.values(COUNTRIES).map((c) => (
                            <option key={c.code} value={c.phoneCode}>
                              {c.flag} {c.phoneCode}
                            </option>
                          ))}
                        </select>
                        <input
                          className="auInput"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(normalizePhoneDigits(e.target.value))}
                          placeholder="9876543210"
                          inputMode="numeric"
                          maxLength={15}
                        />
                      </div>
                    </div>

                    <div className="auField">
                      <label className="auLabel" htmlFor="au-reg-currency">
                        Currency <span className="auOptional" style={{ fontWeight: 400, color: "var(--color-text-muted)", fontSize: "12px" }}>(optional)</span>
                      </label>
                      <select
                        id="au-reg-currency"
                        className="auSelect"
                        value={regCurrency}
                        onChange={(e) => setRegCurrency(e.target.value)}
                      >
                        {CURRENCY_LIST.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.symbol} — {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                      <div className="auFieldHint" style={{ marginTop: 5, fontSize: "12px", color: "var(--color-text-muted)" }}>
                        Your preferred display currency for all amounts in the app.
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Step 2 */}
              {regStep === 2 && (
                <div className="auSectionCard">
                  <div className="auSectionTitle">Firm details</div>
                  <div className="auSectionSub">Used for verification and billing.</div>

                  <div className="auGrid2">
                    <div className="auField">
                      <label className="auLabel">Firm name </label>
                      <input
                        className="auInput"
                        value={firmName}
                        onChange={(e) => setFirmName(e.target.value)}
                        placeholder="Firm name"
                      />
                    </div>
                    <div className="auField">
                      <label className="auLabel">Pin code </label>
                      <input
                        className="auInput"
                        value={pinCode}
                        onChange={(e) => setPinCode(String(e.target.value || "").replace(/\D+/g, "").slice(0, 6))}
                        placeholder="6-digit pin"
                        inputMode="numeric"
                        maxLength={6}
                      />
                    </div>
                  </div>

                  <div className="auGrid2">
                    <div className="auField">
                      <label className="auLabel">City </label>
                      <input
                        className="auInput"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="City"
                      />
                    </div>
                    <div className="auField">
                      <label className="auLabel">State </label>
                      <input
                        className="auInput"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder="State"
                      />
                    </div>
                  </div>

                  <div className="auField">
                    <label className="auLabel">Address </label>
                    <textarea
                      className="auTextarea"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Full address"
                    />
                  </div>
                </div>
              )}

              {/* Step 3 */}
              {regStep === 3 && (
                <div className="auSectionCard">
                  <div className="auSectionTitle">{taxIdLabel} & Drug Licenses</div>
                  <div className="auSectionSub">These must be unique for each account.</div>

                  <div className="auField">
                    <label className="auLabel">{taxIdLabel} (15 chars) </label>
                    <input
                      className="auInput"
                      value={gstNumber}
                      onChange={(e) => setGstNumber(e.target.value)}
                      placeholder="Tax registration number"
                      maxLength={15}
                    />
                  </div>

                  <div className="auGrid2">
                    <div className="auField">
                      <label className="auLabel">Drug license 1 number </label>
                      <input
                        className="auInput"
                        value={dl1Number}
                        onChange={(e) => setDl1Number(e.target.value)}
                        placeholder="DL1 number"
                      />
                    </div>
                    <div className="auField">
                      <label className="auLabel">Drug license 2 number </label>
                      <input
                        className="auInput"
                        value={dl2Number}
                        onChange={(e) => setDl2Number(e.target.value)}
                        placeholder="DL2 number"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4 */}
              {regStep === 4 && (
                <div className="auSectionCard">
                  <div className="auSectionTitle">Documents (images)</div>
                  <div className="auSectionSub">Upload clear photos/scans (max 5MB each).</div>

                  <div className="auDocs">
                    <DocumentUploadField
                      variant="box"
                      label={`${taxIdLabel} certificate`}
                      docType="GST_CERTIFICATE"
                      url={gstCertificateUrl}
                      onUrlChange={setGstCertificateUrl}
                      disabled={regBusy}
                    />
                    <DocumentUploadField
                      variant="box"
                      label="Drug license 1"
                      docType="DRUG_LICENSE_1"
                      url={drugLicense1Url}
                      onUrlChange={setDrugLicense1Url}
                      disabled={regBusy}
                    />
                    <DocumentUploadField
                      variant="box"
                      label="Drug license 2"
                      docType="DRUG_LICENSE_2"
                      url={drugLicense2Url}
                      onUrlChange={setDrugLicense2Url}
                      disabled={regBusy}
                    />
                  </div>
                </div>
              )}

              {/* Sticky nav */}
              <div className="auNavRow" aria-label="Registration navigation">
                <AppButton
                  variant="secondary"
                  className="auSecondaryBtn"
                  type="button"
                  disabled={regBusy}
                  onClick={() => (regStep === 1 ? onSwitchTab("login") : goRegStep(regStep - 1))}
                >
                  {regStep === 1 ? "← Back to sign in" : "← Back"}
                </AppButton>

                {regStep < 4 ? (
                  <AppButton
                    variant="primary"
                    className="auNextBtn"
                    type="button"
                    disabled={regBusy}
                    onClick={() => goRegStep(regStep + 1)}
                  >
                    Next →
                  </AppButton>
                ) : (
                  <AppButton
                    variant="primary"
                    className="auNextBtn"
                    type="button"
                    disabled={regBusy}
                    onClick={handleRegisterSubmit}
                  >
                    {regBusy ? (
                      <InlineButtonProgress label="Submitting…" />
                    ) : (
                      "Submit registration"
                    )}
                  </AppButton>
                )}
              </div>

              <div className="auBottomLink">
                Already registered?{" "}
                <Link to="/login" onClick={(e) => { e.preventDefault(); onSwitchTab("login"); }}>
                  Sign in
                </Link>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}