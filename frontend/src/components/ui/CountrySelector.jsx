/**
 * CountrySelector
 * Reusable dropdown for selecting a country from the COUNTRY_LIST catalogue.
 *
 * Props:
 *   value       {string}   - currently selected country code (e.g. "IN")
 *   onChange    {function} - called with the new country code string
 *   className   {string}   - extra CSS class for the <select> element
 *   showFlag    {boolean}  - prefix each option with the flag emoji (default: true)
 *   showPhone   {boolean}  - suffix each option with the phone code (default: false)
 *   placeholder {string}   - first disabled option text (default: "Select country")
 *   id          {string}   - id attribute for the <select>
 *   name        {string}   - name attribute for the <select>
 *   disabled    {boolean}  - disable the selector
 *   required    {boolean}  - mark as required
 */

import { COUNTRY_LIST } from "../../utils/locale.js";

export default function CountrySelector({
  value = "IN",
  onChange,
  className = "",
  showFlag = true,
  showPhone = false,
  placeholder = "Select country",
  id,
  name,
  disabled = false,
  required = false,
}) {
  function handleChange(e) {
    if (onChange) onChange(e.target.value);
  }

  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={handleChange}
      className={`countrySelector ${className}`.trim()}
      disabled={disabled}
      required={required}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {COUNTRY_LIST.map((country) => {
        const flag = showFlag ? `${country.flag} ` : "";
        const phone = showPhone ? ` (${country.phoneCode})` : "";
        return (
          <option key={country.code} value={country.code}>
            {flag}{country.name}{phone}
          </option>
        );
      })}
    </select>
  );
}