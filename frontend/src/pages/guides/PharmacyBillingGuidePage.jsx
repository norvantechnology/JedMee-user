import ContentGuidePage from "../../components/content/ContentGuidePage.jsx";
import { PHARMACY_BILLING_GUIDE } from "../../data/guides/pharmacyBillingGuide.js";

export default function PharmacyBillingGuidePage() {
  return <ContentGuidePage {...PHARMACY_BILLING_GUIDE} />;
}
