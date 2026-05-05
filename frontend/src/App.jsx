import { AppRoutes } from "./routes/AppRoutes.jsx";
import "./styles/theme.css";
import "./styles/animations.css";
import "./styles/app.css";
import "./styles/buttons-responsive.css";
import { useEffect, useState } from "react";
import { APP_DOCUMENT_TITLE } from "./constants/brand.js";
import { bootstrapAuth } from "./services/authBootstrap.js";

export default function App() {
  const [authHydrated, setAuthHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await bootstrapAuth();
      } finally {
        if (!cancelled) setAuthHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.title = APP_DOCUMENT_TITLE;
  }, []);

  if (!authHydrated) {
    return (
      <div className="authHydrateShell" aria-busy="true" aria-live="polite" style={{ minHeight: "100vh" }} />
    );
  }

  return <AppRoutes />;
}
