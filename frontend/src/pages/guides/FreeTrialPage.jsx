import ContentGuidePage from "../../components/content/ContentGuidePage.jsx";
import { FREE_TRIAL_GUIDE } from "../../data/guides/freeTrialGuide.js";

export default function FreeTrialPage() {
  return <ContentGuidePage {...FREE_TRIAL_GUIDE} />;
}
