import ContentGuidePage from "../../components/content/ContentGuidePage.jsx";
import { PHARMACY_INVENTORY_GUIDE } from "../../data/guides/pharmacyInventoryGuide.js";

export default function PharmacyInventoryGuidePage() {
  return <ContentGuidePage {...PHARMACY_INVENTORY_GUIDE} />;
}
