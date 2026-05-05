import AppShell from "../../layouts/AppShell.jsx";
import { APP_DISPLAY_NAME } from "../../constants/brand.js";
import { readAuth } from "../../services/authStorage.js";

export function useReportShellProps() {
  const auth = readAuth();
  const user = auth?.user || null;
  return {
    title: APP_DISPLAY_NAME,
    userName: user?.full_name || "User",
    userEmail: user?.email || auth?.email || "",
    userBusinessName: user?.firm_name || "",
    userGstNumber: user?.gst_number || "",
    variant: "user"
  };
}

export default function ReportShell({ children, ...override }) {
  const base = useReportShellProps();
  return <AppShell {...base} {...override}>{children}</AppShell>;
}

export function ReportDenied({ title, message }) {
  return (
    <ReportShell>
      <div className="pageWrap">
        <div className="pageCard">
          <div className="raTitle">{title}</div>
          <div className="raSub">{message}</div>
        </div>
      </div>
    </ReportShell>
  );
}
