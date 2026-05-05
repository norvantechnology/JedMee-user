import { useEffect } from "react";
import "./PhoneInput.css";
import { IconTelGlobe, IconTelHandset } from "./ui/AppIcons.jsx";

const MAX_PHONE_DIGITS = 15;

function digitsOnlyMax15(s) {
  return String(s ?? "").replace(/\D/g, "").slice(0, MAX_PHONE_DIGITS);
}

function handlePhoneChange(raw, onPhoneNumberChange) {
  onPhoneNumberChange?.(digitsOnlyMax15(raw));
}

/**
 * Shared phone validation used by master modals (vendor, division, ...).
 * Accepts `countryCode` / `phoneNumber` strings and returns helpful flags so
 * forms can drive both validity gates and inline error messages from one
 * source of truth.
 */
export function validatePhone(countryCode, phoneNumber) {
  const cc = String(countryCode ?? "").trim();
  const pn = String(phoneNumber ?? "").trim();
  const digits = pn.replace(/\D+/g, "");
  const ccOk = /^\+\d{1,4}$/.test(cc);
  const numOk = !pn ? true : /^\d{7,15}$/.test(digits);
  const empty = !pn;
  const ok = empty || (ccOk && /^\d{7,15}$/.test(digits));
  return { ok, ccOk, numOk, digits, empty };
}

export default function PhoneInput({
  countryCodeLabel = "Dialing code",
  phoneLabel = "National number",
  countryCodePlaceholder = "+91",
  phonePlaceholder = "Digits only, no spaces",
  countryCode,
  phoneNumber,
  onCountryCodeChange,
  onPhoneNumberChange,
  countryCodeError = "",
  phoneNumberError = "",
  /** Omit ribbon/hint when parent already shows a field label (e.g. master modals). */
  compact = false
}) {
  useEffect(() => {
    const raw = String(phoneNumber ?? "").replace(/\D/g, "");
    if (raw.length > MAX_PHONE_DIGITS) {
      onPhoneNumberChange?.(raw.slice(0, MAX_PHONE_DIGITS));
    }
  }, [phoneNumber, onPhoneNumberChange]);

  const ccId = "telx-cc";
  const pnId = "telx-pn";

  return (
    <section className={`telx${compact ? " telx_compact" : ""}`} aria-label="Phone number">
      {!compact ? (
        <header className="telxRibbon">
          <span className="telxRibbonMark" aria-hidden="true">
            <IconTelHandset />
          </span>
          <div className="telxRibbonText">
            <span className="telxRibbonKicker">Contact</span>
            <span className="telxRibbonHint">Include the country prefix when you enter a number.</span>
          </div>
        </header>
      ) : null}

      <div className="telxBoard">
        <div className="telxLane">
          <label className="telxLab" htmlFor={ccId}>
            {countryCodeLabel}
          </label>
          <div className={`telxSlot${countryCodeError ? " telxSlot_bad" : ""}`}>
            <span className="telxGlyph" aria-hidden="true">
              <IconTelGlobe />
            </span>
            <input
              id={ccId}
              className="telxInp"
              value={countryCode || ""}
              onChange={(e) => onCountryCodeChange?.(e.target.value)}
              placeholder={countryCodePlaceholder}
              inputMode="tel"
              autoComplete="tel-country-code"
              aria-invalid={countryCodeError ? "true" : undefined}
              aria-describedby={countryCodeError ? `${ccId}-err` : undefined}
            />
          </div>
          {countryCodeError ? (
            <p id={`${ccId}-err`} className="telxErr" role="alert">
              {countryCodeError}
            </p>
          ) : null}
        </div>

        <div className="telxJoin" aria-hidden="true" />

        <div className="telxLane telxLane_grow">
          <label className="telxLab" htmlFor={pnId}>
            {phoneLabel}
          </label>
          <div className={`telxSlot${phoneNumberError ? " telxSlot_bad" : ""}`}>
            <span className="telxGlyph" aria-hidden="true">
              <IconTelHandset />
            </span>
            <input
              id={pnId}
              className="telxInp"
              value={digitsOnlyMax15(phoneNumber)}
              onChange={(e) => handlePhoneChange(e.target.value, onPhoneNumberChange)}
              placeholder={phonePlaceholder}
              inputMode="numeric"
              maxLength={MAX_PHONE_DIGITS}
              autoComplete="tel-national"
              aria-invalid={phoneNumberError ? "true" : undefined}
              aria-describedby={phoneNumberError ? `${pnId}-err` : undefined}
            />
          </div>
          {phoneNumberError ? (
            <p id={`${pnId}-err`} className="telxErr" role="alert">
              {phoneNumberError}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
