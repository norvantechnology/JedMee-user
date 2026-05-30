import { AppButton } from "./ui/buttons.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconBtn } from "./IconBtn.jsx";
import {
  IconBan,
  IconCancel,
  IconChevronDown,
  IconCopy,
  IconEdit,
  IconLinkOut
} from "./ui/AppIcons.jsx";
import "./CommonModal.css";
import "./StructuredForm.css";
import "./UserDetailPanel.css";
import { useLocale } from "../context/LocaleContext.jsx";
import { fmtDateTime } from "../utils/format.js";

function initials(name = "") {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "U";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function roleStyle(role) {
  const raw = String(role || "").trim();
  const r = raw
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z_]/g, "")
    .toUpperCase();
  const map = {
    WHOLESALER: { cls: "udpCap_wholesaler", label: "Wholesaler" },
    RETAILER: { cls: "udpCap_retailer", label: "Retailer" },
    ADMIN: { cls: "udpCap_admin", label: "Admin" },
    PHARMACIST: { cls: "udpCap_pharmacist", label: "Pharmacist" }
  };
  return map[r] || { cls: "udpCap_plain", label: raw || "" };
}

export default function UserDetailPanel({
  open,
  user,
  readOnly = false,
  onClose,
  onStatusChange,
  onEdit,
  onBlock
}) {
  const { taxIdLabel } = useLocale();
  const [status, setStatus] = useState(String(user?.status || "PENDING").toUpperCase());
  const [copied, setCopied] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    setStatus(String(user?.status || "PENDING").toUpperCase());
  }, [user?.status]);

  useEffect(() => {
    function onKey(e) {
      if (!open) return;
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const ui = useMemo(() => {
    if (!user) return null;
    const name = user.full_name || user.name || "-";
    const email = user.email || "-";
    const phone = user.phone || user.phone_number || "-";
    const createdRaw = user.createdAt || user.created_at || "";
    const createdAt = fmtDateTime(createdRaw);
    const address = user.address || "";
    const city = user.city || "";
    const state = user.state || "";
    const pinCode = user.pin_code || user.pinCode || "";
    const firmName = user.firm_name || user.firmName || "";
    const gstNumber = user.gst_number || user.gstNumber || "";
    const gstCertificateUrl = user.gst_certificate_url || user.gstCertificateUrl || "";
    const isBlocked = Boolean(user.isBlocked ?? user.is_blocked);
    const emailVerified = Boolean(user.emailVerified ?? user.email_verified);
    const role = String(user.role || "").trim() || "-";

    return {
      id: user.id,
      name,
      email,
      phone,
      createdAt,
      address,
      city,
      state,
      pinCode,
      firmName,
      gstNumber,
      gstCertificateUrl,
      isBlocked,
      emailVerified,
      role,
      drugLicense1Number: user.drugLicense1Number || user.drug_license_1_number || "",
      drugLicense1Url: user.drugLicense1Url || user.drug_license_1_url || "",
      drugLicense2Number: user.drugLicense2Number || user.drug_license_2_number || "",
      drugLicense2Url: user.drugLicense2Url || user.drug_license_2_url || ""
    };
  }, [user]);

  if (!open) return null;

  const copyEmail = async () => {
    const email = ui?.email || "";
    if (!email || email === "-") return;
    try {
      await navigator.clipboard?.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const r = roleStyle(ui?.role);

  return (
    <div className="udpRoot" aria-hidden={!open}>
      <button className="udpScrim" type="button" onClick={onClose} aria-label="Close user details" />

      <aside className="udpDrawer" aria-label="User profile drawer">
        <header className="udpMast">
          <div className="udpMastText">
            <span className="udpMastKicker">Account</span>
            <h2 className="udpMastTitle">Profile overview</h2>
          </div>
          <IconBtn className="udpMastClose" tooltip="Close panel" ariaLabel="Close panel" onClick={onClose}>
            <IconCancel />
          </IconBtn>
        </header>

        <div className="udpScroll">
          <section className="udpSpotlight" aria-label="User identity">
            <div className="udpSpotlightRing" aria-hidden="true">
              <span className="udpSpotlightGlyph">{initials(ui?.name || "")}</span>
            </div>
            <div className="udpSpotlightMain">
              <p className="udpSpotlightName">{ui?.name || ""}</p>
              <div className="udpSpotlightEmailRow">
                <span className="udpSpotlightEmail">{ui?.email || ""}</span>
                <IconBtn
                  className={["udpSpotlightCopy", copied ? "udpSpotlightCopy_ok" : ""].filter(Boolean).join(" ")}
                  tooltip={copied ? "Copied" : "Copy email"}
                  ariaLabel={copied ? "Email copied" : "Copy email address"}
                  onClick={copyEmail}
                  disabled={!ui?.email || ui.email === "-"}
                >
                  <IconCopy />
                </IconBtn>
              </div>
              <div className="udpSpotlightTags">
                <span className={`udpCap ${r.cls}`}>{r.label}</span>
                <span className={`udpCap ${ui?.emailVerified ? "udpCap_ok" : "udpCap_warn"}`}>
                  {ui?.emailVerified ? "Email verified" : "Email not verified"}
                </span>
              </div>
            </div>
          </section>

          <div className="sfm">
            <section className="sfmSection udpCardLift">
              <div className="sfmSectionHead">
                <div className="sfmTitle">Contact</div>
              </div>
              <ul className="udpLedger" role="list">
                <li className="udpLedgerItem">
                  <span className="udpLedgerKey">Full name</span>
                  <span className="udpLedgerVal">{ui?.name || ""}</span>
                </li>
                <li className="udpLedgerItem">
                  <span className="udpLedgerKey">Email</span>
                  <span className="udpLedgerVal">{ui?.email || ""}</span>
                </li>
                <li className="udpLedgerItem">
                  <span className="udpLedgerKey">Phone</span>
                  <span className="udpLedgerVal">{ui?.phone || ""}</span>
                </li>
                <li className="udpLedgerItem">
                  <span className="udpLedgerKey">Created</span>
                  <span className="udpLedgerVal">{ui?.createdAt || ""}</span>
                </li>
              </ul>
            </section>

            {ui?.firmName || ui?.gstNumber || ui?.gstCertificateUrl ? (
              <section className="sfmSection udpCardLift">
                <div className="sfmSectionHead">
                  <div className="sfmTitle">Business</div>
                </div>
                <ul className="udpLedger" role="list">
                  {ui?.firmName ? (
                    <li className="udpLedgerItem">
                      <span className="udpLedgerKey">Business name</span>
                      <span className="udpLedgerVal">{ui.firmName}</span>
                    </li>
                  ) : null}
                  {ui?.gstNumber ? (
                    <li className="udpLedgerItem">
                      <span className="udpLedgerKey">{taxIdLabel}</span>
                      <span className="udpLedgerVal">{ui.gstNumber}</span>
                    </li>
                  ) : null}
                </ul>
                {ui?.gstCertificateUrl ? (
                  <div className="udpAttach udpAttach_first">
                    <div className="udpAttachKicker">{taxIdLabel} certificate</div>
                    <p className="udpAttachLead">Supporting document</p>
                    <a className="udpAttachLink" href={ui.gstCertificateUrl} target="_blank" rel="noreferrer">
                      <span className="udpAttachLinkIco" aria-hidden="true">
                        <IconLinkOut />
                      </span>
                      Open document
                    </a>
                  </div>
                ) : null}
              </section>
            ) : null}

            {ui?.address || ui?.city || ui?.state || ui?.pinCode ? (
              <section className="sfmSection udpCardLift">
                <div className="sfmSectionHead">
                  <div className="sfmTitle">Location</div>
                </div>
                <ul className="udpLedger" role="list">
                  {ui?.address ? (
                    <li className="udpLedgerItem udpLedgerItem_span">
                      <span className="udpLedgerKey">Street address</span>
                      <span className="udpLedgerVal">{ui.address}</span>
                    </li>
                  ) : null}
                  {ui?.city ? (
                    <li className="udpLedgerItem">
                      <span className="udpLedgerKey">City</span>
                      <span className="udpLedgerVal">{ui.city}</span>
                    </li>
                  ) : null}
                  {ui?.state ? (
                    <li className="udpLedgerItem">
                      <span className="udpLedgerKey">State</span>
                      <span className="udpLedgerVal">{ui.state}</span>
                    </li>
                  ) : null}
                  {ui?.pinCode ? (
                    <li className="udpLedgerItem">
                      <span className="udpLedgerKey">PIN code</span>
                      <span className="udpLedgerVal">{ui.pinCode}</span>
                    </li>
                  ) : null}
                </ul>
              </section>
            ) : null}

            <section className="sfmSection udpCardLift">
              <div className="sfmSectionHead">
                <div className="sfmTitle">Account status</div>
              </div>
              <ul className="udpLedger" role="list">
                <li className="udpLedgerItem udpLedgerItem_span">
                  <span className="udpLedgerKey">Approval status</span>
                  <div className="udpLedgerControl">
                    <div className="udpSelectShell">
                      <select
                        className="mfzInput udpSelectEl"
                        value={status}
                        disabled={readOnly}
                        onChange={(e) => {
                          const next = String(e.target.value || "").toUpperCase();
                          setStatus(next);
                          onStatusChange?.(ui?.id, next);
                        }}
                      >
                        <option value="APPROVED">Approved</option>
                        <option value="PENDING">Pending</option>
                        <option value="REJECTED">Rejected</option>
                        <option value="BLOCKED">Blocked</option>
                      </select>
                      <span className="udpSelectGlyph" aria-hidden="true">
                        <IconChevronDown />
                      </span>
                    </div>
                  </div>
                </li>
                <li className="udpLedgerItem">
                  <span className="udpLedgerKey">Access</span>
                  <span className="udpLedgerVal">
                    <span className={`udpCap ${ui?.isBlocked ? "udpCap_bad" : "udpCap_ok"}`}>{ui?.isBlocked ? "Blocked" : "Active"}</span>
                  </span>
                </li>
                <li className="udpLedgerItem">
                  <span className="udpLedgerKey">Role</span>
                  <span className="udpLedgerVal">
                    <span className={`udpCap ${r.cls}`}>{r.label}</span>
                  </span>
                </li>
                <li className="udpLedgerItem">
                  <span className="udpLedgerKey">Email state</span>
                  <span className="udpLedgerVal">
                    <span className={`udpCap ${ui?.emailVerified ? "udpCap_ok" : "udpCap_warn"}`}>
                      {ui?.emailVerified ? "Verified" : "Not verified"}
                    </span>
                  </span>
                </li>
              </ul>
            </section>

            {ui?.drugLicense1Number || ui?.drugLicense2Number ? (
              <section className="sfmSection udpCardLift">
                <div className="sfmSectionHead">
                  <div className="sfmTitle">Drug licenses</div>
                </div>
                <div className="udpAttachList">
                  {ui?.drugLicense1Number ? (
                    <div className="udpAttach">
                      <div className="udpAttachKicker">License 1</div>
                      <p className="udpAttachLead">{ui.drugLicense1Number}</p>
                      {ui?.drugLicense1Url ? (
                        <a className="udpAttachLink" href={ui.drugLicense1Url} target="_blank" rel="noreferrer">
                          <span className="udpAttachLinkIco" aria-hidden="true">
                            <IconLinkOut />
                          </span>
                          Open document
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  {ui?.drugLicense2Number ? (
                    <div className="udpAttach">
                      <div className="udpAttachKicker">License 2</div>
                      <p className="udpAttachLead">{ui.drugLicense2Number}</p>
                      {ui?.drugLicense2Url ? (
                        <a className="udpAttachLink" href={ui.drugLicense2Url} target="_blank" rel="noreferrer">
                          <span className="udpAttachLinkIco" aria-hidden="true">
                            <IconLinkOut />
                          </span>
                          Open document
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        {!readOnly ? (
          <footer className="sfmModalFooter udpLaunch">
            <AppButton type="button" variant="primary" size="md" icon={<IconEdit />} disabled={!onEdit} onClick={() => onEdit?.(ui?.id)}>
              Edit user
            </AppButton>
            <AppButton type="button" variant="danger" size="md" icon={<IconBan />} disabled={!onBlock} onClick={() => onBlock?.(ui?.id)}>
              Block user
            </AppButton>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
