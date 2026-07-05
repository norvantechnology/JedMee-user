import { AppRoutes } from "./routes/AppRoutes.jsx";
import "./styles/theme.css";
import "./styles/animations.css";
import "./styles/app.css";
import "./styles/buttons-responsive.css";
import "./styles/common.css";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { bootstrapAuth, startTokenRefreshTimer, stopTokenRefreshTimer } from "./services/authBootstrap.js";
import { useRouteIndexing } from "./utils/seo.js";

export default function App() {
  const [authHydrated, setAuthHydrated] = useState(false);
  const { pathname } = useLocation();
  useRouteIndexing(pathname);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await bootstrapAuth();
      } finally {
        if (!cancelled) setAuthHydrated(true);
      }
    })();
    // Start the background proactive refresh timer.
    startTokenRefreshTimer();
    return () => {
      cancelled = true;
      stopTokenRefreshTimer();
    };
  }, []);

  if (!authHydrated) {
    return (
      <div className="authHydrateShell" aria-busy="true" aria-live="polite" style={{ minHeight: "100vh" }} />
    );
  }

  return <AppRoutes />;
}
