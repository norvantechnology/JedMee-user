import { InlineButtonProgress } from "../components/ui/buttons.jsx";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { emitToast } from "../services/toastBus.js";
import { registerUser, uploadRegistrationDocViaPresign } from "../services/registrationService.js";
import { requestOtp } from "../services/authService.js";
import { isCountryCodeLike, isEmailLike, isPhoneDigitsValid, normalizePhoneDigits } from "../utils/validation.js";
import { parseApiError } from "../utils/api.js";
import { otpRequestSuccessMessage } from "../utils/authUiMessages.js";
import "./RegistrationPage.css";
import { APP_DISPLAY_NAME } from "../constants/brand.js";
import { IconPlus } from "../components/ui/AppIcons.jsx";
import { useLocale } from "../context/LocaleContext.jsx";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);
// TEMP: Skip real S3 upload for now (treat file selection as "uploaded").
const SKIP_S3_UPLOAD = true;

function pickFileError(file) {
  if (!file) return "File is required.";
  if (!ALLOWED_TYPES.has(String(file.type || "").toLowerCase())) return "Invalid file type. Use jpg, jpeg, png, gif, or webp.";
  if (file.size > MAX_FILE_BYTES) return "Max file size is 5MB.";
  return "";
}

function FileField({ label, hint = "jpg/png/webp/gif • max 5MB", file, onPick }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className={`regUpload ${file ? "hasFile" : ""}`}>
        <input
          className="regUploadInput"
          type="file"
          accept="image/*"
          onChange={(e) => onPick(e.target.files?.[0] || null)}
        />
        <div className="regUploadMain">
          <div className="regUploadTitle">{file ? file.name : "Choose file"}</div>
          <div className="regUploadHint">{file ? "Ready to upload" : hint}</div>
        </div>
        <div className="regUploadBtn" aria-hidden="true">
          Browse
        </div>
      </div>
    </div>
  );
}

export default function RegistrationPage() {
  const navigate = useNavigate();
  const { taxIdLabel } = useLocale();
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("WHOLESALER");
  const [step, setStep] = useState(0); // 0 Basic, 1 Business, 2 Legal, 3 Documents
  const [anim, setAnim] = useState(""); // "inRight" | "inLeft"

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");

  const [firmName, setFirmName] = useState("");
  const [address, setAddress] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  const [gstNumber, setGstNumber] = useState("");
  const [dl1Number, setDl1Number] = useState("");
  const [dl2Number, setDl2Number] = useState("");

  const [gstFile, setGstFile] = useState(null);
  const [dl1File, setDl1File] = useState(null);
  const [dl2File, setDl2File] = useState(null);

  const phoneDigits = useMemo(() => normalizePhoneDigits(phoneNumber), [phoneNumber]);

  const sanitizePhone = (e) => {
    const el = e.currentTarget;
    const digits = normalizePhoneDigits(el.value).slice(0, 15);
    if (el.value !== digits) el.value = digits;
    setPhoneNumber(digits);
  };

  const sanitizePin = (e) => {
    const digits = String(e.currentTarget.value || "").replace(/\D+/g, "").slice(0, 6);
    setPinCode(digits);
  };

  async function uploadDoc(docType, file) {
    if (SKIP_S3_UPLOAD) {
      const err = pickFileError(file);
      if (err) return { ok: false, error: err };

      // Backend requires a URL-like value (http/https). Use a dummy URL for now.
      const safeName = encodeURIComponent(String(file?.name || docType).slice(0, 120));
      const fileUrl = `https://uploads.jedmee.local/mock/${docType}/${Date.now()}-${safeName}`;
      return { ok: true, fileUrl };
    }

    const result = await uploadRegistrationDocViaPresign({ docType, file }, { toast: "none" });
    if (!result.ok) return { ok: false, error: result.error || "Upload failed." };
    return { ok: true, fileUrl: result.fileUrl };
  }

  const stepLabel = (i) => (i === 0 ? "Basic" : i === 1 ? "Business" : i === 2 ? "Legal" : "Documents");

  const validateStep = (s) => {
    if (s === 0) {
      if (!fullName.trim() || fullName.trim().length < 2) return "Full name must be at least 2 characters.";
      if (!isEmailLike(email)) return "Enter a valid email address.";
      if (!isCountryCodeLike(countryCode)) return "Select a valid country code.";
      if (!isPhoneDigitsValid(phoneDigits)) return "Phone number must be 7 to 15 digits.";
      if (!password || password.length < 8) return "Password must be at least 8 characters.";
    }
    if (s === 1) {
      if (!firmName.trim()) return "Firm name is required.";
      if (!address.trim()) return "Address is required.";
      if (!/^\d{6}$/.test(pinCode)) return "Pin code must be 6 digits.";
      if (!city.trim()) return "City is required.";
      if (!state.trim()) return "State is required.";
    }
    if (s === 2) {
      if (!gstNumber.trim() || gstNumber.trim().length !== 15) return `${taxIdLabel} must be 15 characters.`;
      if (!dl1Number.trim()) return "Drug license 1 number is required.";
      if (!dl2Number.trim()) return "Drug license 2 number is required.";
    }
    if (s === 3) {
      const hasGst = Boolean(gstFile);
      if (!hasGst) {
        const gstErr = pickFileError(gstFile);
        return `${taxIdLabel} Certificate: ${gstErr || "File is required."}`;
      }
      const hasDl1 = Boolean(dl1File);
      if (!hasDl1) {
        const dl1Err = pickFileError(dl1File);
        return `Drug License 1: ${dl1Err || "File is required."}`;
      }
      const hasDl2 = Boolean(dl2File);
      if (!hasDl2) {
        const dl2Err = pickFileError(dl2File);
        return `Drug License 2: ${dl2Err || "File is required."}`;
      }
    }
    return "";
  };

  useEffect(() => {
    if (!anim) return;
    const t = window.setTimeout(() => setAnim(""), 380);
    return () => window.clearTimeout(t);
  }, [anim]);

  const goNext = () => {
    const msg = validateStep(step);
    if (msg) {
      emitToast({ type: "error", message: msg });
      return;
    }
    setAnim("inRight");
    setStep((s) => Math.min(3, s + 1));
  };

  const goBack = () => {
    setAnim("inLeft");
    setStep((s) => Math.max(0, s - 1));
  };

  return (
    <div className="authBody regPage">
      <div className="wrapper regWrap">
        <div className="card regCard">
          <div className="card-header">
            <div className="logo-row">
              <img src="/logo.png" alt="JedMee" className="auth-logo-img" />
            </div>
          </div>

          <div className="panel">
            <div className="regTop">
              <div>
                <div className="form-title">Registration</div>
                <p className="form-sub">
                  Submit your details and documents. Status will be <strong>PENDING</strong> until admin approval.
                </p>
              </div>
            </div>

            <div className="roleRow" role="group" aria-label="Select role">
              <button type="button" className={`roleChip ${role === "WHOLESALER" ? "active" : ""}`} onClick={() => setRole("WHOLESALER")}>
                Wholesaler
              </button>
              <button type="button" className={`roleChip ${role === "RETAILER" ? "active" : ""}`} onClick={() => setRole("RETAILER")}>
                Retailer
              </button>
            </div>

            <form
              noValidate
              onKeyDown={(e) => {
                if (busy) return;
                if (e.key !== "Enter") return;

                const el = e.target;
                const tag = String(el?.tagName || "").toLowerCase();
                const type = String(el?.type || "").toLowerCase();

                // Don't hijack Enter in multiline fields or file pickers.
                if (tag === "textarea") return;
                if (type === "file") return;

                // Enter should behave like Next (steps 0-2) or Submit (step 3)
                if (step < 3) {
                  e.preventDefault();
                  goNext();
                } else {
                  // Let the form submit normally, but ensure it submits even if focus isn't on the button.
                  // (Some browsers only submit if there's a submit button in the form.)
                  e.preventDefault();
                  e.currentTarget.requestSubmit?.();
                }
              }}
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;

                // Submit only from the last step
                if (step !== 3) return;

                const allMsg = [0, 1, 2, 3].map(validateStep).find(Boolean);
                if (allMsg) {
                  emitToast({ type: "error", message: allMsg });
                  return;
                }

                setBusy(true);

                // Upload docs to S3
                const up1 = await uploadDoc("GST_CERTIFICATE", gstFile);
                if (!up1.ok) {
                  emitToast({ type: "error", message: up1.error });
                  setBusy(false);
                  return;
                }
                if (SKIP_S3_UPLOAD) emitToast({ type: "success", message: `${taxIdLabel} certificate uploaded (mock).` });
                const up2 = await uploadDoc("DRUG_LICENSE_1", dl1File);
                if (!up2.ok) {
                  emitToast({ type: "error", message: up2.error });
                  setBusy(false);
                  return;
                }
                if (SKIP_S3_UPLOAD) emitToast({ type: "success", message: "Drug license 1 uploaded (mock)." });
                const up3 = await uploadDoc("DRUG_LICENSE_2", dl2File);
                if (!up3.ok) {
                  emitToast({ type: "error", message: up3.error });
                  setBusy(false);
                  return;
                }
                if (SKIP_S3_UPLOAD) emitToast({ type: "success", message: "Drug license 2 uploaded (mock)." });

                const resp = await registerUser({
                  role,
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
                  gstCertificateUrl: up1.fileUrl,
                  drugLicense1Url: up2.fileUrl,
                  drugLicense2Url: up3.fileUrl
                });

                if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
                  const otpResp = await requestOtp({ email, role });
                  if (otpResp.status < 200 || !otpResp.json?.ok) {
                    emitToast({ type: "error", message: parseApiError(otpResp) });
                    setBusy(false);
                    return;
                  }
                  emitToast({ type: "success", message: otpRequestSuccessMessage(otpResp.json?.meta) });
                  navigate(`/verify-otp?email=${encodeURIComponent(email)}&role=${encodeURIComponent(role)}`, { replace: true });
                } else {
                  const fieldErrors = resp?.json?.error?.details?.fieldErrors;
                  if (fieldErrors && typeof fieldErrors === "object") {
                    const first = Object.values(fieldErrors).find(Boolean);
                    emitToast({ type: "error", message: String(first || "Validation failed") });
                  } else {
                    emitToast({ type: "error", message: parseApiError(resp) });
                  }
                }

                setBusy(false);
              }}
            >
              <div className="regWizard">
                <div className={`regStepPanel ${anim ? `regStepPanel_${anim}` : ""}`}>
                  {step === 0 ? (
                    <div className="regSection">
                    <div className="regSectionHead">
                      <div className="regSectionTitle">Basic information</div>
                      <div className="regSectionSub">Used to identify you and contact you.</div>
                    </div>
                    <div className="regGrid2">
                      <div className="field">
                        <label>Full name </label>
                        <input className="regInput" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
                      </div>
                      <div className="field">
                        <label>Email </label>
                        <input className="regInput" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" />
                      </div>
                    </div>
                    <div className="regGrid2">
                      <div className="field">
                        <label>Phone </label>
                        <div className="regPhoneRow">
                          <select className="regSelect" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                            <option value="+91">🇮🇳 +91</option>
                            <option value="+1">🇺🇸 +1</option>
                            <option value="+44">🇬🇧 +44</option>
                            <option value="+61">🇦🇺 +61</option>
                            <option value="+971">🇦🇪 +971</option>
                          </select>
                          <input className="regInput" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} onInput={sanitizePhone} placeholder="9876543210" />
                        </div>
                      </div>
                      <div className="field">
                        <label>Password </label>
                        <input className="regInput" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create password (min 8 chars)" />
                      </div>
                    </div>
                    </div>
                  ) : null}

                  {step === 1 ? (
                    <div className="regSection">
                    <div className="regSectionHead">
                      <div className="regSectionTitle">Business information</div>
                      <div className="regSectionSub">Firm details used for verification and billing.</div>
                    </div>
                    <div className="regGrid2">
                      <div className="field">
                        <label>Firm name </label>
                        <input className="regInput" value={firmName} onChange={(e) => setFirmName(e.target.value)} placeholder="Firm name" />
                      </div>
                      <div className="field">
                        <label>Pin code </label>
                        <input className="regInput" value={pinCode} onChange={(e) => setPinCode(e.target.value)} onInput={sanitizePin} placeholder="6-digit pin" inputMode="numeric" />
                      </div>
                    </div>
                    <div className="regGrid2">
                      <div className="field">
                        <label>City </label>
                        <input className="regInput" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
                      </div>
                      <div className="field">
                        <label>State </label>
                        <input className="regInput" value={state} onChange={(e) => setState(e.target.value)} placeholder="State" />
                      </div>
                    </div>
                    <div className="field">
                      <label>Address </label>
                      <textarea className="regTextarea" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address" />
                    </div>
                    </div>
                  ) : null}

                  {step === 2 ? (
                    <div className="regSection">
                    <div className="regSectionHead">
                      <div className="regSectionTitle">Legal & verification</div>
                      <div className="regSectionSub">These must be unique for each account.</div>
                    </div>
                    <div className="field">
                      <label>{taxIdLabel} (15 chars) </label>
                      <input className="regInput" value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} placeholder="Tax registration number" maxLength={15} />
                    </div>
                    <div className="regGrid2">
                      <div className="field">
                        <label>Drug license 1 number </label>
                        <input className="regInput" value={dl1Number} onChange={(e) => setDl1Number(e.target.value)} placeholder="DL1 number" />
                      </div>
                      <div className="field">
                        <label>Drug license 2 number </label>
                        <input className="regInput" value={dl2Number} onChange={(e) => setDl2Number(e.target.value)} placeholder="DL2 number" />
                      </div>
                    </div>
                    </div>
                  ) : null}

                  {step === 3 ? (
                    <div className="regSection">
                    <div className="regSectionHead">
                      <div className="regSectionTitle">Documents (images)</div>
                      <div className="regSectionSub">Upload clear photos/scans (max 5MB each).</div>
                    </div>
                    <div className="regDocs">
                      <FileField
                        label={`${taxIdLabel} certificate`}
                        file={gstFile}
                        onPick={(f) => {
                          setGstFile(f);
                          if (SKIP_S3_UPLOAD && f) emitToast({ type: "success", message: `${taxIdLabel} certificate selected (mock upload success).` });
                        }}
                      />
                      <FileField
                        label="Drug license 1"
                        file={dl1File}
                        onPick={(f) => {
                          setDl1File(f);
                          if (SKIP_S3_UPLOAD && f) emitToast({ type: "success", message: "Drug license 1 selected (mock upload success)." });
                        }}
                      />
                      <FileField
                        label="Drug license 2"
                        file={dl2File}
                        onPick={(f) => {
                          setDl2File(f);
                          if (SKIP_S3_UPLOAD && f) emitToast({ type: "success", message: "Drug license 2 selected (mock upload success)." });
                        }}
                      />
                    </div>
                    </div>
                  ) : null}
                </div>

                <div className="regWizardNav">
                  <button
                    className="regNavBtn"
                    type="button"
                    disabled={busy || step === 0}
                    onClick={goBack}
                  >
                    Back
                  </button>

                  {step < 3 ? (
                    <button
                      className="regNavPrimary"
                      type="button"
                      disabled={busy}
                      onClick={goNext}
                    >
                      Next
                    </button>
                  ) : (
                    <button className="submit-btn" type="submit" disabled={busy}>
                      {busy ? <InlineButtonProgress label="Submitting..." /> : "Submit registration"}
                    </button>
                  )}
                </div>

                <div className="regFooter">
                  <span>Already registered?</span> <Link to="/login">Sign in</Link>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

