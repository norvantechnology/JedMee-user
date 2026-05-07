import { InlineButtonProgress } from "../components/ui/buttons.jsx";
import { useSeoMeta } from "../utils/seo.js";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../layouts/AppShell.jsx";
import { onAuthChanged, readAuth, saveAuthUser } from "../services/authStorage.js";
import DocumentUploadField from "../components/DocumentUploadField.jsx";
import { updateMe } from "../services/userService.js";
import { clean } from "../utils/format.js";
import "./ProfileSettingsPage.css";
import { IconPsBell, IconPsBuilding, IconPsCalendar, IconPsCheck, IconPsChevronDown, IconPsFileText, IconPsFolder, IconPsMail, IconPsMapPin, IconPsPencil, IconPsPhone, IconPsSettings, IconPsUser } from "../components/ui/AppIcons.jsx";

function initialsFromName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : parts[0]?.[1] || "";
  return (a + b).toUpperCase() || "U";
}

function fileNameFromUrl(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(last).slice(0, 120);
  } catch {
    return String(url || "").slice(0, 120);
  }
}

export default function ProfileSettingsPage() {
  useSeoMeta({ title: "Profile Settings" });
  const auth = readAuth();
  const user = auth?.user || null;
  const [authTick, setAuthTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [collapsed, setCollapsed] = useState({
    personal: false,
    business: false,
    docs: false,
    address: false
  });

  useEffect(() => {
    return onAuthChanged(() => setAuthTick((t) => t + 1));
  }, []);

  const initial = useMemo(() => {
    // eslint-disable-next-line no-unused-vars
    const _ = authTick;
    const a = readAuth();
    const u = a?.user || {};
    return {
      fullName: u.full_name || "",
      firmName: u.firm_name || "",
      gstNumber: u.gst_number || "",
      drugLicense1Number: u.drug_license_1_number || "",
      drugLicense2Number: u.drug_license_2_number || "",
      gstCertificateUrl: u.gst_certificate_url || "",
      drugLicense1Url: u.drug_license_1_url || "",
      drugLicense2Url: u.drug_license_2_url || "",
      phoneCountryCode: u.phone_country_code || "+91",
      phoneNumber: u.phone_number || "",
      address: u.address || "",
      city: u.city || "",
      state: u.state || "",
      pinCode: u.pin_code || ""
    };
  }, [authTick]);

  const [form, setForm] = useState(initial);

  useEffect(() => {
    setForm(initial);
    setSubmitted(false);
  }, [initial]);

  const phoneCcOk = /^\+\d{1,4}$/.test(clean(form.phoneCountryCode));
  const phoneNumDigits = clean(form.phoneNumber).replace(/\D+/g, "");
  const phoneNumOk = /^\d{7,15}$/.test(phoneNumDigits);
  const gstOk = !clean(form.gstNumber) || clean(form.gstNumber).length === 15;
  const urlOk = (v) => !clean(v) || /^https?:\/\/.+/i.test(clean(v));
  const canSave =
    clean(form.fullName).length >= 2 &&
    phoneCcOk &&
    phoneNumOk &&
    gstOk &&
    urlOk(form.gstCertificateUrl) &&
    urlOk(form.drugLicense1Url) &&
    urlOk(form.drugLicense2Url) &&
    !busy;

  const dirty = useMemo(() => {
    const a = initial;
    const b = form;
    const keys = Object.keys(a);
    for (const k of keys) {
      if (String(a[k] ?? "") !== String(b[k] ?? "")) return true;
    }
    return false;
  }, [form, initial]);

  const roleLabel = String(user?.role || "").toUpperCase() || "USER";
  const statusLabel = String(user?.status || "").toUpperCase() || "";
  const emailVerifiedLabel = user?.email_verified ? "Email verified" : "Email not verified";
  const avatarText = initialsFromName(user?.full_name || user?.email || "User");

  const ccOptions = ["+91", "+1", "+44"];
  const ccValue = clean(form.phoneCountryCode) || "+91";
  const ccList = ccOptions.includes(ccValue) ? ccOptions : [ccValue, ...ccOptions];

  return (
    <AppShell
     
      userName={user?.full_name || "User"}
      userEmail={user?.email || auth?.email || ""}
      userBusinessName={user?.firm_name || ""}
      userGstNumber={user?.gst_number || ""}
      variant="user"
    >
      <div className="psPage">
        <div className="page">
          <div className="page-header">
            <div>
              <h1 className="page-title">Profile settings</h1>
              <p className="page-subtitle">Update your personal and business profile details.</p>
            </div>
          </div>

          <div className="hero-card">
            <div className="hero-avatar-wrap">
              <div className="hero-avatar">{avatarText}</div>
              <button className="avatar-edit-btn" type="button" title="Change photo" disabled>
                <IconPsPencil />
              </button>
            </div>
            <div className="hero-info">
              <div className="hero-name">{user?.full_name || "User"}</div>
              <div className="hero-email">
                {user?.email || auth?.email || ""} · Business: {user?.firm_name || form.firmName || ""}
              </div>
              <div className="hero-badges">
                <span className="badge badge-blue">
                  <IconPsUser />
                  {roleLabel}
                </span>
                {statusLabel ? (
                  <span className="badge badge-green">
                    <IconPsCheck />
                    {statusLabel}
                  </span>
                ) : null}
                <span className="badge badge-gray">
                  <IconPsMail />
                  {emailVerifiedLabel}
                </span>
              </div>
            </div>
            <div className="hero-btns">
              <button className="btn-ghost-sm" type="button" disabled>
                <IconPsBell />
                Notifications
              </button>
              <button className="btn-ghost-sm" type="button" disabled>
                <IconPsSettings />
                Preferences
              </button>
            </div>
          </div>

          <div className={`section-card ${collapsed.personal ? "collapsed" : ""}`} id="s-personal">
            <div
              className="section-hdr"
              role="button"
              tabIndex={0}
              onClick={() => setCollapsed((p) => ({ ...p, personal: !p.personal }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setCollapsed((p) => ({ ...p, personal: !p.personal }));
              }}
            >
              <div className="section-hdr-left">
                <div className="section-icon">
                  <IconPsUser size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <div className="section-title">Personal</div>
                  <div className="section-desc">Your name and contact details</div>
                </div>
              </div>
              <div className="section-chevron">
                <IconPsChevronDown />
              </div>
            </div>
            <div className="section-body">
              <div className="form-grid cols-2">
                <div className="form-field">
                  <label className="form-label" htmlFor="fullName">
                    Full name <span className="reqMark" aria-hidden="true">*</span>
                  </label>
                  <div className="input-wrap">
                    <span className="input-icon">
                      <IconPsUser size={18} strokeWidth={2} />
                    </span>
                    <input
                      className="form-input"
                      id="fullName"
                      type="text"
                      value={form.fullName}
                      onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                      placeholder="Full name"
                      disabled={busy}
                    />
                  </div>
                  {submitted && clean(form.fullName).length < 2 && <div className="psInlineErr">Full name is required (at least 2 characters).</div>}
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="email">
                    Email address
                  </label>
                  <div className="input-wrap">
                    <span className="input-icon">
                      <IconPsMail size={18} strokeWidth={2} />
                    </span>
                    <input className="form-input" id="email" type="email" value={user?.email || ""} readOnly />
                  </div>
                </div>
              </div>

              <div className="form-grid cols-phone mt-16">
                <div className="form-field">
                  <label className="form-label">Code</label>
                  <select
                    className="form-select"
                    value={ccValue}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, phoneCountryCode: e.target.value }))}
                  >
                    {ccList.map((v) => (
                      <option key={v} value={v}>
                        {v === "+91" ? "🇮🇳 " : v === "+1" ? "🇺🇸 " : v === "+44" ? "🇬🇧 " : ""}
                        {v}
                      </option>
                    ))}
                  </select>
                  {!phoneCcOk ? <div className="psInlineErr">Use format like +91</div> : null}
                </div>
                <div className="form-field">
                  <label className="form-label">
                    Phone number <span className="reqMark" aria-hidden="true">*</span>
                  </label>
                  <div className="input-wrap">
                    <span className="input-icon">
                      <IconPsPhone size={18} strokeWidth={2} />
                    </span>
                    <input
                      className="form-input"
                      type="tel"
                      value={form.phoneNumber}
                      onChange={(e) => setForm((p) => ({ ...p, phoneNumber: e.target.value }))}
                      disabled={busy}
                      placeholder="Phone number"
                    />
                  </div>
                  {!phoneNumOk ? <div className="psInlineErr">Phone must be 7 to 15 digits</div> : null}
                </div>
              </div>
            </div>
          </div>

          <div className={`section-card ${collapsed.business ? "collapsed" : ""}`} id="s-business">
            <div
              className="section-hdr"
              role="button"
              tabIndex={0}
              onClick={() => setCollapsed((p) => ({ ...p, business: !p.business }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setCollapsed((p) => ({ ...p, business: !p.business }));
              }}
            >
              <div className="section-hdr-left">
                <div className="section-icon">
                  <IconPsBuilding size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <div className="section-title">Business</div>
                  <div className="section-desc">Firm name, GST and drug license details</div>
                </div>
              </div>
              <div className="section-chevron">
                <IconPsChevronDown />
              </div>
            </div>
            <div className="section-body">
              <div className="form-grid" style={{ marginBottom: 16 }}>
                <div className="form-field">
                  <label className="form-label" htmlFor="bizName">
                    Business name
                  </label>
                  <div className="input-wrap">
                    <span className="input-icon">
                      <IconPsBuilding size={18} strokeWidth={2} />
                    </span>
                    <input
                      className="form-input"
                      id="bizName"
                      type="text"
                      value={form.firmName}
                      onChange={(e) => setForm((p) => ({ ...p, firmName: e.target.value }))}
                      disabled={busy}
                    />
                  </div>
                </div>
              </div>

              <div className="form-grid cols-2">
                <div className="form-field">
                  <label className="form-label" htmlFor="gst">
                    GST number
                  </label>
                  <div className="input-wrap">
                    <span className="input-icon">
                      <IconPsCalendar size={18} strokeWidth={2} />
                    </span>
                    <input
                      className="form-input"
                      id="gst"
                      type="text"
                      value={form.gstNumber}
                      onChange={(e) => setForm((p) => ({ ...p, gstNumber: e.target.value }))}
                      placeholder="15 characters"
                      disabled={busy}
                    />
                  </div>
                  {!gstOk ? <div className="psInlineErr">GST must be 15 characters</div> : null}
                </div>
                <div className="form-field">
                  <label className="form-label">Status</label>
                  <input className="form-input status-ok" type="text" value={statusLabel || ""} readOnly />
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="dl1">
                    Drug license 1
                  </label>
                  <div className="input-wrap">
                    <span className="input-icon">
                      <IconPsFileText size={18} strokeWidth={2} />
                    </span>
                    <input
                      className="form-input"
                      id="dl1"
                      type="text"
                      value={form.drugLicense1Number}
                      onChange={(e) => setForm((p) => ({ ...p, drugLicense1Number: e.target.value }))}
                      disabled={busy}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="dl2">
                    Drug license 2
                  </label>
                  <div className="input-wrap">
                    <span className="input-icon">
                      <IconPsFileText size={18} strokeWidth={2} />
                    </span>
                    <input
                      className="form-input"
                      id="dl2"
                      type="text"
                      value={form.drugLicense2Number}
                      onChange={(e) => setForm((p) => ({ ...p, drugLicense2Number: e.target.value }))}
                      disabled={busy}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={`section-card ${collapsed.docs ? "collapsed" : ""}`} id="s-docs">
            <div
              className="section-hdr"
              role="button"
              tabIndex={0}
              onClick={() => setCollapsed((p) => ({ ...p, docs: !p.docs }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setCollapsed((p) => ({ ...p, docs: !p.docs }));
              }}
            >
              <div className="section-hdr-left">
                <div className="section-icon">
                  <IconPsFolder size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <div className="section-title">Documents</div>
                  <div className="section-desc">Preview, download or replace your files</div>
                </div>
              </div>
              <div className="section-chevron">
                <IconPsChevronDown />
              </div>
            </div>
            <div className="section-body">
              <div className="doc-list">
                <DocumentUploadField
                  label="GST certificate"
                  docType="GST_CERTIFICATE"
                  url={form.gstCertificateUrl}
                  disabled={busy}
                  onUrlChange={(v) => setForm((p) => ({ ...p, gstCertificateUrl: v }))}
                />
                <DocumentUploadField
                  label="Drug license 1 document"
                  docType="DRUG_LICENSE_1"
                  url={form.drugLicense1Url}
                  disabled={busy}
                  onUrlChange={(v) => setForm((p) => ({ ...p, drugLicense1Url: v }))}
                />
                <DocumentUploadField
                  label="Drug license 2 document"
                  docType="DRUG_LICENSE_2"
                  url={form.drugLicense2Url}
                  disabled={busy}
                  onUrlChange={(v) => setForm((p) => ({ ...p, drugLicense2Url: v }))}
                />
              </div>
              {!urlOk(form.gstCertificateUrl) || !urlOk(form.drugLicense1Url) || !urlOk(form.drugLicense2Url) ? (
                <div className="psInlineErr" style={{ marginTop: 12 }}>
                  One or more document URLs are invalid.
                </div>
              ) : null}
            </div>
          </div>

          <div className={`section-card ${collapsed.address ? "collapsed" : ""}`} id="s-address">
            <div
              className="section-hdr"
              role="button"
              tabIndex={0}
              onClick={() => setCollapsed((p) => ({ ...p, address: !p.address }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setCollapsed((p) => ({ ...p, address: !p.address }));
              }}
            >
              <div className="section-hdr-left">
                <div className="section-icon">
                  <IconPsMapPin size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <div className="section-title">Address</div>
                  <div className="section-desc">Used for billing and delivery</div>
                </div>
              </div>
              <div className="section-chevron">
                <IconPsChevronDown />
              </div>
            </div>
            <div className="section-body">
              <div className="form-grid" style={{ marginBottom: 16 }}>
                <div className="form-field">
                  <label className="form-label" htmlFor="addr">
                    Address
                  </label>
                  <div className="input-wrap">
                    <span className="input-icon">
                      <IconPsMapPin size={18} strokeWidth={2} />
                    </span>
                    <input
                      className="form-input"
                      id="addr"
                      type="text"
                      value={form.address}
                      onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                      disabled={busy}
                    />
                  </div>
                </div>
              </div>
              <div className="form-grid cols-2">
                <div className="form-field">
                  <label className="form-label" htmlFor="city">
                    City
                  </label>
                  <input
                    className="form-input"
                    id="city"
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                    placeholder="City"
                    disabled={busy}
                  />
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="state">
                    State
                  </label>
                  <input
                    className="form-input"
                    id="state"
                    type="text"
                    value={form.state}
                    onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                    placeholder="State"
                    disabled={busy}
                  />
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="pin">
                    Pin code
                  </label>
                  <input
                    className="form-input"
                    id="pin"
                    type="text"
                    value={form.pinCode}
                    onChange={(e) => setForm((p) => ({ ...p, pinCode: e.target.value }))}
                    placeholder="Pin code"
                    disabled={busy}
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">Email verified</label>
                  <input className="form-input status-ok" type="text" value={user?.email_verified ? "Yes" : "No"} readOnly />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="save-bar">
          <div className="save-bar-btns">
            <button className="btn-cancel" type="button" disabled={!dirty || busy} onClick={() => setForm(initial)}>
              Discard
            </button>
            <button
              className="btn-save"
              type="button"
              disabled={!dirty || busy}
              onClick={async () => {
                setSubmitted(true);
                if (!canSave) return;
                setBusy(true);
                const resp = await updateMe({
                  fullName: clean(form.fullName),
                  firmName: clean(form.firmName),
                  gstNumber: clean(form.gstNumber),
                  drugLicense1Number: clean(form.drugLicense1Number),
                  drugLicense2Number: clean(form.drugLicense2Number),
                  gstCertificateUrl: clean(form.gstCertificateUrl),
                  drugLicense1Url: clean(form.drugLicense1Url),
                  drugLicense2Url: clean(form.drugLicense2Url),
                  phoneCountryCode: clean(form.phoneCountryCode),
                  phoneNumber: phoneNumDigits,
                  address: clean(form.address),
                  city: clean(form.city),
                  state: clean(form.state),
                  pinCode: clean(form.pinCode)
                });
                if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
                  const updated = resp.json?.data?.user;
                  if (updated) {
                    saveAuthUser({ ...(readAuth()?.user || {}), ...updated });
                  }
                }
                setBusy(false);
              }}
            >
              <IconPsCheck />
              {busy ? <InlineButtonProgress label="Saving…" /> : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

