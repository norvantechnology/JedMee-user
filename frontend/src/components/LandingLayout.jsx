import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { readAuth } from "../services/authStorage.js";
import { GUIDE_LINKS } from "../data/resourceLinks.js";
import ResourcesNav from "./content/ResourcesNav.jsx";
import "../pages/LandingPage.css";

/* ─────────────────────────────────────────────────────────────
   ICON COMPONENT (shared subset used by nav/footer)
───────────────────────────────────────────────────────────── */
function Icon({ name, size = 20, className = "" }) {
  const p = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round",
    strokeLinejoin: "round", className: `ln-icon ${className}`,
  };
  const icons = {
    arrow:   <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    menu:    <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    x:       <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    shield:  <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    lock:    <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    globe:   <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
    mail:    <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    phone:   <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.56 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></>,
    mapPin:  <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
  };
  return <svg {...p}>{icons[name] || null}</svg>;
}

/* ─────────────────────────────────────────────────────────────
   SHARED NAV
───────────────────────────────────────────────────────────── */
function SharedNav({ isLanding = false }) {
  const navigate = useNavigate();
  const authed = Boolean(readAuth()?.refreshToken);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Nav links: anchor-based for landing sections, router Link for pages
  const links = [
    { label: "Features", href: isLanding ? "#features" : "/#features" },
    { label: "Pricing",  href: isLanding ? "#pricing"  : "/#pricing"  },
    { label: "About",    to: "/about" },
    { label: "Contact",  to: "/contact" },
  ];

  return (
    <>
      <nav className={`ln-nav${scrolled ? " ln-nav--solid" : ""}${open ? " ln-nav--open" : ""}`}>
        <div className="ln-nav-inner">
          <Link className="ln-nav-logo" to="/">
            <picture>
              <source srcSet="/logo.webp" type="image/webp" />
              <img src="/logo.png" alt="JedMee pharmacy management software logo" className="ln-nav-logo-img" width={120} height={34} decoding="async" />
            </picture>
          </Link>
          <ul className="ln-nav-links">
            {links.map(l => (
              <li key={l.label}>
                {l.to
                  ? <Link to={l.to}>{l.label}</Link>
                  : <a href={l.href}>{l.label}</a>
                }
              </li>
            ))}
            <ResourcesNav />
          </ul>
          <div className="ln-nav-actions">
            {authed ? (
              <button className="ln-btn ln-btn--primary" onClick={() => navigate("/dashboard")}>
                Dashboard <Icon name="arrow" size={16} />
              </button>
            ) : (
              <>
                <button className="ln-btn ln-btn--ghost" onClick={() => navigate("/login")}>Log In</button>
                <button className="ln-btn ln-btn--primary" onClick={() => navigate("/register")}>
                  Get Started Free <Icon name="arrow" size={16} />
                </button>
              </>
            )}
          </div>
          <button className="ln-nav-burger" onClick={() => setOpen(o => !o)} aria-label="Menu">
            <Icon name={open ? "x" : "menu"} size={22} />
          </button>
        </div>
      </nav>

      {open && (
        <div className="ln-mobile-menu" role="dialog" aria-label="Navigation menu">
          <ul className="ln-mobile-menu-links">
            {links.map(l => (
              <li key={l.label}>
                {l.to
                  ? <Link to={l.to} className="ln-mobile-menu-link" onClick={() => setOpen(false)}>{l.label}</Link>
                  : <a href={l.href} className="ln-mobile-menu-link" onClick={() => setOpen(false)}>{l.label}</a>
                }
              </li>
            ))}
            <li className="ln-mobile-menu-section">Resources</li>
            {GUIDE_LINKS.map((g) => (
              <li key={g.to}>
                <Link to={g.to} className="ln-mobile-menu-link" onClick={() => setOpen(false)}>{g.label}</Link>
              </li>
            ))}
          </ul>
          <div className="ln-mobile-menu-auth">
            {authed ? (
              <button className="ln-btn ln-btn--primary ln-btn--full" onClick={() => { setOpen(false); navigate("/dashboard"); }}>
                Dashboard <Icon name="arrow" size={16} />
              </button>
            ) : (
              <>
                <button className="ln-btn ln-btn--ghost ln-btn--full" onClick={() => { setOpen(false); navigate("/login"); }}>Log In</button>
                <button className="ln-btn ln-btn--primary ln-btn--full" onClick={() => { setOpen(false); navigate("/register"); }}>
                  Get Started Free <Icon name="arrow" size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   SHARED FOOTER
───────────────────────────────────────────────────────────── */
function SharedFooter() {
  return (
    <footer className="ln-footer">
      <div className="ln-container">
        <div className="ln-footer-top">
          <div className="ln-footer-brand">
            <picture>
              <source srcSet="/logo.webp" type="image/webp" />
              <img src="/logo.png" alt="JedMee pharmacy management software logo" className="ln-footer-logo" width={120} height={34} loading="lazy" decoding="async" />
            </picture>
            <p className="ln-footer-tagline">Simple, powerful software for medicine shops and distributors across India.</p>
            <div className="ln-footer-badges">
              {[["shield","Tax Compliant"],["lock","Secure"],["globe","Cloud-Based"]].map(([icon, label]) => (
                <span key={label} className="ln-footer-badge"><Icon name={icon} size={12} />{label}</span>
              ))}
            </div>
            <a href="mailto:supportjedmee@gmail.com" style={{ display: "block", marginTop: "10px", fontSize: "0.8rem", color: "rgba(255,255,255,0.55)", textDecoration: "none" }}>
              supportjedmee@gmail.com
            </a>
          </div>
          <div className="ln-footer-col">
            <div className="ln-footer-col-title">Platform</div>
            <ul>
              <li><a href="/#features">Features</a></li>
              <li><a href="/#workflow">How It Works</a></li>
              <li><a href="/#platform">Platform Preview</a></li>
              <li><a href="/#pricing">Pricing</a></li>
            </ul>
          </div>
          <div className="ln-footer-col">
            <div className="ln-footer-col-title">Resources</div>
            <ul>
              {GUIDE_LINKS.map((g) => (
                <li key={g.to}><Link to={g.to}>{g.label}</Link></li>
              ))}
            </ul>
          </div>
          <div className="ln-footer-col">
            <div className="ln-footer-col-title">Company</div>
            <ul>
              <li><Link to="/about">About JedMee</Link></li>
              <li><Link to="/contact">Contact Us</Link></li>
              <li><Link to="/terms">Terms of Service</Link></li>
            </ul>
          </div>
        </div>
        <div className="ln-footer-bottom">
          <span>© 2026 JedMee. All rights reserved.</span>
          <span>Built for Indian pharmaceutical businesses</span>
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────────────────────────────────────────
   LANDING LAYOUT WRAPPER
───────────────────────────────────────────────────────────── */
export default function LandingLayout({ children, isLanding = false }) {
  return (
    <div className="ln-root">
      <SharedNav isLanding={isLanding} />
      <main style={{ paddingTop: "64px" }}>
        {children}
      </main>
      <SharedFooter />
    </div>
  );
}

export { SharedNav, SharedFooter, Icon };