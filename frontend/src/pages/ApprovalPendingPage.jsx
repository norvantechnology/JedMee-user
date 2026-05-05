import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuth, readAuth } from "../services/authStorage.js";
import { logout } from "../services/authService.js";
import "./ApprovalPendingPage.css";
import { useSeoMeta } from "../utils/seo.js";

export default function ApprovalPendingPage() {
  const navigate = useNavigate();
  useSeoMeta({ title: "Account Pending Approval" });
  const auth = readAuth();
  const user = auth?.user || null;
  const status = String(user?.status || "").toUpperCase();
  const isBlocked = Boolean(user?.is_blocked);

  const ui = useMemo(() => {
    if (isBlocked) {
      return {
        title: "Account blocked",
        msg: "Your account is currently blocked. Please contact support."
      };
    }
    if (status === "REJECTED") {
      return {
        title: "Approval rejected",
        msg: "Your registration was rejected by admin. Please contact support for next steps."
      };
    }
    return {
      title: "Approval pending",
      msg: "Your registration is under admin review. You'll be able to use the app once it's approved."
    };
  }, [isBlocked, status]);

  return (
    <div className="apPage" role="main" aria-label="Approval status">
      <div className="apCard" role="dialog" aria-modal="true">
        <div className="apTitle">{ui.title}</div>
        <div className="apMsg">{ui.msg}</div>
        <div className="apActions">
          <button
            className="apBtn"
            type="button"
            onClick={() => {
              const authNow = readAuth();
              if (authNow?.email && authNow?.refreshToken) {
                logout({ email: authNow.email, refreshToken: authNow.refreshToken }).catch(() => {});
              }
              clearAuth();
              navigate("/login", { replace: true });
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

