import React, { useCallback, useEffect, useRef, useState } from "react";
import { getCurrencySymbol } from "../utils/currency.js";
import { useNavigate, Link } from "react-router-dom";
import { readAuth } from "../services/authStorage.js";
import { getPublicPlans } from "../services/plansService.js";
import { useSeoMeta } from "../utils/seo.js";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./LandingPage.css";

gsap.registerPlugin(ScrollTrigger);

/* ─────────────────────────────────────────────────────────────
   ICON COMPONENT
───────────────────────────────────────────────────────────── */
function Icon({ name, size = 20, className = "" }) {
  const p = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round",
    strokeLinejoin: "round", className: `ln-icon ${className}`,
  };
  const icons = {
    package:     <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    cart:        <><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
    file:        <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
    chart:       <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    users:       <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    truck:       <><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
    shield:      <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    trending:    <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    bell:        <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    zap:         <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    lock:        <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    globe:       <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
    arrow:       <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    chevronR:    <><polyline points="9 18 15 12 9 6"/></>,
    chevronD:    <><polyline points="6 9 12 15 18 9"/></>,
    menu:        <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    x:           <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    star:        <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    receipt:     <><polyline points="4 2 4 22 7 20 10 22 13 20 16 22 19 20 20 22 20 2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/></>,
    layers:      <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    alertCircle: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    barChart:    <><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></>,
    eye:         <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    checkMark:   <><polyline points="20 6 9 17 4 12"/></>,
    building:    <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
    clipboard:   <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></>,
    sparkle:     <><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" fill="currentColor" stroke="none"/><path d="M5 3l.75 2.25L8 6l-2.25.75L5 9l-.75-2.25L2 6l2.25-.75z" fill="currentColor" stroke="none"/></>,
    creditCard:  <><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
    activity:    <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
  };
  return <svg {...p}>{icons[name] || null}</svg>;
}

/* ─────────────────────────────────────────────────────────────
   COUNTER COMPONENT
───────────────────────────────────────────────────────────── */
function Counter({ end, suffix = "", duration = 2000 }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const s = performance.now();
        const tick = (n) => {
          const p = Math.min((n - s) / duration, 1);
          setVal(Math.floor((1 - Math.pow(1 - p, 3)) * end));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        obs.unobserve(el);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [end, duration]);
  return <span ref={ref}>{val}{suffix}</span>;
}

/* ─────────────────────────────────────────────────────────────
   NAVIGATION
───────────────────────────────────────────────────────────── */
function LandingNav({ navigate, authed }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  const links = [
    { label: "Features", href: "#features" },
    { label: "Pricing",  href: "#pricing" },
    { label: "About",    to: "/about" },
    { label: "Contact",  to: "/contact" },
  ];
  return (
    <>
      <nav className={`ln-nav${scrolled ? " ln-nav--solid" : ""}${open ? " ln-nav--open" : ""}`}>
        <div className="ln-nav-inner">
          <a className="ln-nav-logo" href="#top">
            <img src="/logo.png" alt="JedMee" className="ln-nav-logo-img" />
          </a>
          {/* Desktop nav links */}
          <ul className="ln-nav-links">
            {links.map(l => (
              <li key={l.label}>
                {l.to
                  ? <Link to={l.to}>{l.label}</Link>
                  : <a href={l.href}>{l.label}</a>
                }
              </li>
            ))}
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

      {/* Mobile menu — rendered as sibling of nav, outside its stacking context */}
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
   HERO SECTION
───────────────────────────────────────────────────────────── */
function HeroSection({ navigate }) {
  const avatars = ["RP", "SK", "PS", "AM", "VK"];
  return (
    <section className="ln-hero" id="top">
      <div className="ln-hero-bg">
        <div className="ln-hero-orb ln-hero-orb--1" />
        <div className="ln-hero-orb ln-hero-orb--2" />
        <div className="ln-hero-grid" />
      </div>
      <div className="ln-container ln-hero-inner">
        <div className="ln-hero-content">
          <div className="ln-hero-badge">
            <Icon name="sparkle" size={14} />
            <span>Pharmacy Management Software</span>
          </div>
          <h1 className="ln-hero-title">
            Run Your Pharmacy<br />
            <span className="ln-hero-title-accent">Smarter. Faster.</span>
          </h1>
          <p className="ln-hero-sub">
            JedMee helps medicine shops and distributors manage stock, billing, orders, and payments — all in one simple app.
          </p>
          <div className="ln-hero-ctas">
            <button className="ln-btn ln-btn--primary ln-btn--lg" onClick={() => navigate("/login")}>
              Start Free Trial <Icon name="arrow" size={18} />
            </button>
            <a className="ln-btn ln-btn--outline ln-btn--lg" href="#platform">
              <Icon name="eye" size={18} /> See Platform
            </a>
          </div>
          <div className="ln-hero-proof">
            <div className="ln-hero-avatars">
              {avatars.map((ini, idx) => (
                <div key={idx} className="ln-hero-avatar" style={{ "--i": idx }}>{ini}</div>
              ))}
            </div>
            <div className="ln-hero-proof-text">
              <span className="ln-hero-proof-count">500+</span> pharmacies trust JedMee
            </div>
          </div>
          <div className="ln-hero-trust">
            {["No credit card required", "Tax compliant", "Setup in minutes"].map(t => (
              <div key={t} className="ln-hero-trust-item">
                <Icon name="checkMark" size={13} /><span>{t}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ln-hero-visual">
          <div className="ln-dash-scene">
            <div className="ln-dash-main">
              <DashboardMockup />
            </div>
            <div className="ln-dash-float ln-dash-float--1">
              <Icon name="checkCircle" size={15} className="ln-fi ln-fi--green" />
              <div><div className="ln-fl">Order Confirmed</div><div className="ln-fv">ORD-2026-0042</div></div>
            </div>
            <div className="ln-dash-float ln-dash-float--2">
              <Icon name="alertCircle" size={15} className="ln-fi ln-fi--amber" />
              <div><div className="ln-fl">Expiry Alert</div><div className="ln-fv">3 batches</div></div>
            </div>
            <div className="ln-dash-float ln-dash-float--3">
              <Icon name="trending" size={15} className="ln-fi ln-fi--purple" />
              <div><div className="ln-fl">Today's Sales</div><div className="ln-fv">$24,850</div></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   DASHBOARD MOCKUP
───────────────────────────────────────────────────────────── */
function DashboardMockup() {
  const bars = [65, 45, 80, 55, 90, 70, 85];
  const buys = [40, 55, 35, 60, 45, 30, 50];
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const maxH = 48;

  return (
    <div className="ln-mock">
      {/* Sidebar */}
      <div className="ln-mock-side">
        <div className="ln-mock-logo">
          <img src="/logo.png" alt="JedMee" className="ln-mock-logo-img" />
        </div>
        <div className="ln-mock-nav-group">MAIN</div>
        <div className="ln-mock-nav-item ln-mock-nav-item--active"><span className="ln-mock-dot" />Dashboard</div>
        <div className="ln-mock-nav-group">MASTER SETUP</div>
        {["Products", "Manufacturers", "Suppliers", "Customers", "Order Catalog"].map(n => (
          <div key={n} className="ln-mock-nav-item"><span className="ln-mock-dot" />{n}</div>
        ))}
        <div className="ln-mock-nav-group">TRANSACTIONS</div>
        {["Purchases", "Sales & Billing", "My Orders", "Prescriptions"].map(n => (
          <div key={n} className="ln-mock-nav-item"><span className="ln-mock-dot" />{n}</div>
        ))}
        <div className="ln-mock-nav-group">REPORTS</div>
        {["Inventory Reports", "Day Book"].map(n => (
          <div key={n} className="ln-mock-nav-item"><span className="ln-mock-dot" />{n}</div>
        ))}
      </div>
      {/* Main Content */}
      <div className="ln-mock-main">
        <div className="ln-mock-topbar">
          <div className="ln-mock-breadcrumb">JEDMEE <span>›</span> Dashboard</div>
          <div className="ln-mock-topbar-right">
            <span className="ln-mock-icon-dot" /><span className="ln-mock-icon-dot" />
            <span className="ln-mock-avatar">RE</span>
          </div>
        </div>
        <div className="ln-mock-body">
          <div className="ln-mock-page-title">Dashboard</div>
          <div className="ln-mock-kpis">
            {[
              { label: "Today's Sales", val: "$24,850", trend: "↑ 12%", up: true, color: "#6b3fa0" },
              { label: "Purchases", val: "$8,200", trend: "↓ 3%", up: false, color: "#0ea5e9" },
              { label: "Net Profit", val: "$16,650", trend: "↑ 8%", up: true, color: "#22c55e" },
            ].map((k, i) => (
              <div key={i} className="ln-mock-kpi" style={{ borderTopColor: k.color }}>
                <div className="ln-mock-kpi-label">{k.label}</div>
                <div className="ln-mock-kpi-val">{k.val}</div>
                <div className={`ln-mock-kpi-trend ${k.up ? "up" : "down"}`}>{k.trend}</div>
              </div>
            ))}
          </div>
          <div className="ln-mock-chart">
            <div className="ln-mock-chart-head">
              <span className="ln-mock-chart-title">Sales vs Purchases — This Week</span>
              <div className="ln-mock-legend">
                <span className="ln-mock-dot-sales" />Sales
                <span className="ln-mock-dot-buy" />Purchases
              </div>
            </div>
            <svg viewBox={`0 0 ${days.length * 30 + 10} 70`} className="ln-mock-svg">
              {days.map((d, i) => {
                const x = i * 30 + 5;
                const sH = (bars[i] / 100) * maxH;
                const bH = (buys[i] / 100) * maxH;
                return (
                  <g key={i}>
                    <rect x={x} y={52 - sH} width={9} height={sH} rx="2" className="ln-bar-s" />
                    <rect x={x + 11} y={52 - bH} width={9} height={bH} rx="2" className="ln-bar-b" />
                    <text x={x + 9} y={65} textAnchor="middle" className="ln-chart-label">{d}</text>
                  </g>
                );
              })}
              <line x1="5" y1="52" x2={days.length * 30 + 5} y2="52" className="ln-chart-axis" />
            </svg>
          </div>
          <div className="ln-mock-alerts">
            <div className="ln-mock-alert warn">⚠ 3 batches expiring</div>
            <div className="ln-mock-alert info">📦 2 low stock items</div>
            <div className="ln-mock-alert ok">✓ Tax compliant</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   TRUSTED BY TICKER
───────────────────────────────────────────────────────────── */
function TrustedBySection() {
  const types = [
    "Retail Pharmacy", "Wholesale Distributor", "Hospital Pharmacy", "Medical Store",
    "Drug Store", "Pharma Distributor", "Generic Medicine Shop", "Herbal Medicine Store",
    "Retail Pharmacy", "Wholesale Distributor", "Hospital Pharmacy", "Medical Store",
    "Drug Store", "Pharma Distributor", "Generic Medicine Shop", "Herbal Medicine Store",
  ];
  return (
    <section className="ln-trusted">
      <div className="ln-trusted-label">Trusted by all types of pharmacy businesses worldwide</div>
      <div className="ln-trusted-track">
        <div className="ln-trusted-inner">
          {types.map((t, i) => (
            <div key={i} className="ln-trusted-chip">
              <Icon name="checkCircle" size={12} className="ln-trusted-icon" />{t}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   STATS STRIP
───────────────────────────────────────────────────────────── */
function StatsSection() {
  const stats = [
    { icon: "building", val: 500, suffix: "+", label: "Pharmacies", sub: "Using JedMee", color: "#6b3fa0" },
    { icon: "receipt",  val: 2,   suffix: "M+", label: "Bills Created", sub: "& Printed", color: "#0ea5e9" },
    { icon: "zap",      val: 40,  suffix: "%",  label: "Time Saved", sub: "Every Day", color: "#f97316" },
    { icon: "shield",   val: 99,  suffix: ".9%", label: "Uptime", sub: "Always Available", color: "#22c55e" },
  ];
  return (
    <section className="ln-stats">
      <div className="ln-container">
        <div className="ln-stats-strip">
          {stats.map((s, i) => (
            <div key={i} className="ln-stat" style={{ "--sc": s.color }}>
              <div className="ln-stat-icon"><Icon name={s.icon} size={22} /></div>
              <div className="ln-stat-num"><Counter end={s.val} suffix={s.suffix} /></div>
              <div className="ln-stat-label">{s.label}</div>
              <div className="ln-stat-sub">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   PROBLEM SECTION
───────────────────────────────────────────────────────────── */
function ProblemSection() {
  const problems = [
    {
      icon: "clipboard", color: "#ef4444", num: "01",
      title: "Manual Stock Counting",
      desc: "Counting medicines by hand takes hours and still causes errors. You never know your exact stock.",
      solution: "JedMee tracks stock automatically — always accurate",
    },
    {
      icon: "alertCircle", color: "#f97316", num: "02",
      title: "Medicines Going Expired",
      desc: "Expired medicines mean losses and unhappy customers. Easy to miss without alerts.",
      solution: "Get notified before any medicine expires",
    },
    {
      icon: "file", color: "#6b3fa0", num: "03",
      title: "Slow Paper Billing",
      desc: "Handwritten bills are slow, messy, and hard to find. Tax calculations are a headache.",
      solution: "Create tax invoices in seconds — print or share instantly",
    },
    {
      icon: "bell", color: "#0ea5e9", num: "04",
      title: "Orders via Phone & WhatsApp",
      desc: "Phone orders cause confusion — items get missed, quantities go wrong.",
      solution: "Retailers order online — you confirm with one click",
    },
  ];
  return (
    <section className="ln-problem" id="problems">
      <div className="ln-container">
        <div className="ln-section-label">Common Problems</div>
        <h2 className="ln-section-title">Running a Pharmacy Is Hard.<br />We Make It Simple.</h2>
        <div className="ln-problem-list">
          {problems.map((p, i) => (
            <div key={i} className="ln-problem-row" style={{ "--pc": p.color }}>
              <div className="ln-problem-num">{p.num}</div>
              <div className="ln-problem-icon"><Icon name={p.icon} size={24} /></div>
              <div className="ln-problem-body">
                <h3>{p.title}</h3>
                <p>{p.desc}</p>
              </div>
              <div className="ln-problem-fix">
                <Icon name="checkMark" size={12} /><span>{p.solution}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   FEATURES BENTO GRID
───────────────────────────────────────────────────────────── */
function FeaturesSection() {
  const features = [
    { icon: "package", color: "#6b3fa0", title: "Stock Management", desc: "Track all medicines, batches, expiry dates, and stock levels in one place.", wide: true },
    { icon: "receipt", color: "#0ea5e9", title: "Tax Billing & Invoicing", desc: "Create compliant invoices in seconds for walk-in or credit customers. Print or share instantly.", wide: true },
    { icon: "cart",    color: "#f97316", title: "Order Management", desc: "Retailers order from wholesalers online. Track every order from placement to delivery." },
    { icon: "bell",    color: "#ef4444", title: "Expiry Alerts", desc: "Automatic alerts when medicines are about to expire or run low." },
    { icon: "truck",   color: "#22c55e", title: "Supplier & Purchases", desc: "Record purchases, track payment due dates, and manage all suppliers." },
    { icon: "users",   color: "#8b5cf6", title: "Customer Management", desc: "Track outstanding payments, credit limits, and full purchase history." },
    { icon: "chart",   color: "#06b6d4", title: "Sales Reports & Day Book", desc: "See daily sales, purchases, and profit at a glance. Clear numbers, simple reports.", wide: true },
    { icon: "layers",  color: "#f97316", title: "Retailer & Wholesaler Roles", desc: "Separate views for retailers and wholesalers — each user sees exactly what they need.", wide: true },
  ];
  return (
    <section className="ln-features" id="features">
      <div className="ln-container">
        <div className="ln-section-label">What You Get</div>
        <h2 className="ln-section-title">Everything Your Pharmacy Needs,<br />In One Place</h2>
        <p className="ln-section-sub">Billing, stock, orders, reports — all connected, all simple.</p>
        <div className="ln-bento">
          {features.map((f, i) => (
            <div key={i} className={`ln-feat${f.wide ? " ln-feat--wide" : ""}`}
              style={{ "--fc": f.color, "--delay": `${i * 0.07}s` }}>
              <div className="ln-feat-icon"><Icon name={f.icon} size={f.wide ? 26 : 22} /></div>
              <div className="ln-feat-body">
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   WORKFLOW SECTION
───────────────────────────────────────────────────────────── */
function WorkflowSection() {
  const [tab, setTab] = useState("retailer");
  const workflows = {
    retailer: [
      { icon: "package",  step: "01", title: "Add Your Medicines",  desc: "Add medicines with batch numbers, expiry dates, and prices." },
      { icon: "receipt",  step: "02", title: "Create Bills Fast",   desc: "Create tax invoices for walk-in or credit customers in seconds." },
      { icon: "users",    step: "03", title: "Manage Customers",    desc: "Track who owes you money and their full payment history." },
      { icon: "barChart", step: "04", title: "Check Performance",   desc: "See daily sales, stock levels, and expiry alerts at a glance." },
    ],
    wholesaler: [
      { icon: "layers",   step: "01", title: "Set Up Your Catalog",   desc: "List your medicines with prices. Retailers browse and order online." },
      { icon: "bell",     step: "02", title: "Confirm Orders",        desc: "See new orders instantly. Confirm with one click — no phone calls." },
      { icon: "truck",    step: "03", title: "Manage Stock",          desc: "Track all stock and batches. Record purchases and supplier payments." },
      { icon: "barChart", step: "04", title: "Grow Your Business",    desc: "Monitor receivables and check daily business performance." },
    ],
  };
  const steps = workflows[tab];
  return (
    <section className="ln-workflow" id="workflow">
      <div className="ln-container">
        <div className="ln-section-label">How It Works</div>
        <h2 className="ln-section-title">Simple Steps. Powerful Results.</h2>
        <p className="ln-section-sub">Get started in minutes. No training needed.</p>
        <div className="ln-wf-tabs">
          <button className={`ln-wf-tab${tab === "retailer" ? " active" : ""}`} onClick={() => setTab("retailer")}>
            <Icon name="building" size={16} /> For Retailers
          </button>
          <button className={`ln-wf-tab${tab === "wholesaler" ? " active" : ""}`} onClick={() => setTab("wholesaler")}>
            <Icon name="truck" size={16} /> For Wholesalers
          </button>
        </div>
        <div className="ln-wf-timeline">
          {steps.map((s, i) => (
            <div key={`${tab}-${i}`} className="ln-wf-node" style={{ "--delay": `${i * 0.1}s` }}>
              <div className="ln-wf-node-top">
                <div className="ln-wf-circle"><Icon name={s.icon} size={20} /></div>
                {i < steps.length - 1 && <div className="ln-wf-connector" />}
              </div>
              <div className="ln-wf-step">Step {s.step}</div>
              <h3 className="ln-wf-title">{s.title}</h3>
              <p className="ln-wf-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   PLATFORM PREVIEW
───────────────────────────────────────────────────────────── */
function PlatformSection() {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = [
    { label: "Products", icon: "package" },
    { label: "Purchases", icon: "truck" },
    { label: "Sales & Billing", icon: "receipt" },
    { label: "Order Catalog", icon: "cart" },
  ];
  const tableData = [
    {
      cols: "28px 72px 1fr 88px 44px 88px 56px 88px",
      headers: ["#", "CODE", "PRODUCT NAME", "DRUG NAME", "TAX", "MFG", "TYPE", "CREATED"],
      rows: [
        ["1", "AUG-001", "Augmentin (Amox+Clav)", "Augmentin", "5%", "GSK Pharma", "OTC", "2026-04-28"],
        ["2", "IBU-002", "Ibuprofen 400mg", "Ibuprofen", "5%", "PharmaCo", "OTC", "2026-04-25"],
        ["3", "MET-003", "Metformin 500mg", "Metformin", "--", "MedLabs", "OTC", "2026-04-28"],
        ["4", "CHL-004", "Chloroform", "Chloroform", "5%", "Test Co.", "OTHER", "2026-04-29"],
        ["5", "LIS-005", "Lisinopril 10mg", "Lisinopril", "--", "HealthCorp", "OTC", "2026-04-26"],
      ],
    },
    {
      cols: "28px 96px 90px 82px 82px 62px 62px 82px 72px",
      headers: ["#", "INVOICE NO", "SUPPLIER", "DATE", "DUE DATE", "TOTAL", "BALANCE", "STATUS", "PAYMENT"],
      rows: [
        ["1", "PI-2026-0014", "MedSupply Co.", "2026-05-01", "2026-05-02", "$105", "$105", "CONFIRMED", "UNPAID"],
        ["2", "PI-2026-0013", "Global Dist.", "2026-05-01", "2026-05-02", "$105", "$105", "CONFIRMED", "UNPAID"],
        ["3", "PI-2026-0012", "MedSupply Co.", "2026-05-01", "2026-05-02", "$105", "$105", "CONFIRMED", "UNPAID"],
        ["4", "PI-2026-0011", "Global Dist.", "2026-05-01", "2026-05-02", "$105", "$105", "DRAFT", "UNPAID"],
        ["5", "PI-2026-0010", "MedSupply Co.", "2026-04-30", "2026-05-01", "$52.50", "$52.50", "CONFIRMED", "UNPAID"],
      ],
    },
    {
      cols: "28px 90px 1fr 76px 44px 62px 62px 62px 82px 72px",
      headers: ["#", "INVOICE", "CUSTOMER", "DATE", "ITEMS", "TOTAL", "PAID", "BALANCE", "STATUS", "PAYMENT"],
      rows: [
        ["1", "SI-2026-0005", "Walk-in / Counter", "2026-05-01", "1", "$315", "$0", "$315", "CONFIRMED", "UNPAID"],
        ["2", "SI-2026-0004", "Alex M.", "2026-04-30", "1", "$300", "$300", "$0", "CONFIRMED", "PAID"],
        ["3", "SI-2026-0003", "Walk-in / Counter", "2026-04-28", "1", "$200", "$200", "$0", "CONFIRMED", "PAID"],
        ["4", "SI-2026-0002", "Walk-in / Counter", "2026-04-28", "1", "$1,500", "$1,500", "$0", "CONFIRMED", "PAID"],
        ["5", "SI-2026-0001", "Alex M.", "2026-04-27", "1", "$200", "$200", "$0", "CONFIRMED", "PAID"],
      ],
    },
    {
      cols: "1fr 90px 100px 90px 56px 52px 44px 64px",
      headers: ["PRODUCT", "DRUG NAME", "WHOLESALER", "CATALOG PRICE", "MRP", "STOCK", "TAX", "MIN/MAX"],
      rows: [
        ["Amoxicillin 500", "Amoxicillin", "MedSupply Co.", "$12.00", "$18.00", "1001", "5%", "1 / 10"],
        ["Ibuprofen 400", "Ibuprofen", "MedSupply Co.", "$8.50", "$14.00", "56", "5%", "1 / 10"],
        ["Augmentin 625", "Augmentin", "Global Dist.", "$22.00", "$30.00", "240", "5%", "1 / 50"],
        ["Metformin 500", "Metformin", "PharmaDirect", "$6.00", "$10.00", "580", "5%", "1 / 100"],
        ["Lisinopril 10", "Lisinopril", "HealthSource", "$5.00", "$9.00", "320", "--", "1 / 200"],
      ],
    },
  ];
  const cur = tableData[activeTab];
  return (
    <section className="ln-platform" id="platform">
      <div className="ln-container">
        <div className="ln-section-label">Platform Preview</div>
        <h2 className="ln-section-title">See JedMee in Action</h2>
        <p className="ln-section-sub">Clean, fast, and built for daily pharmacy work.</p>
        <div className="ln-plat-tabs">
          {tabs.map((t, i) => (
            <button key={i} className={`ln-plat-tab${activeTab === i ? " active" : ""}`}
              onClick={() => setActiveTab(i)}>
              <Icon name={t.icon} size={15} />{t.label}
            </button>
          ))}
        </div>
        <div className="ln-plat-window">
          <div className="ln-plat-bar">
            <span className="ln-plat-dot red" /><span className="ln-plat-dot amber" /><span className="ln-plat-dot green" />
            <span className="ln-plat-title">JedMee — {tabs[activeTab].label}</span>
          </div>
          <div className="ln-plat-app">
            <div className="ln-plat-side">
              <div className="ln-plat-side-logo"><img src="/logo.png" alt="JedMee" className="ln-plat-side-logo-img" /></div>
              {["Dashboard", "Products", "Manufacturers", "Suppliers", "Customers", "Order Catalog",
                "Purchases", "Sales & Billing", "My Orders", "Prescriptions", "Inventory Reports", "Day Book"].map((item, i) => (
                <div key={i} className={`ln-plat-nav-item${item === tabs[activeTab].label ? " active" : ""}`}>
                  <span className="ln-plat-nav-dot" />{item}
                </div>
              ))}
            </div>
            <div className="ln-plat-content">
              <div className="ln-plat-topbar">
                <span className="ln-plat-breadcrumb">JEDMEE <span>›</span> {tabs[activeTab].label}</span>
                <div className="ln-plat-topbar-right">
                  <span className="ln-plat-icon-dot" /><span className="ln-plat-icon-dot" />
                  <span className="ln-plat-avatar">RE</span>
                </div>
              </div>
              <div className="ln-plat-body">
                <div className="ln-plat-page-title">{tabs[activeTab].label}</div>
                <div className="ln-plat-toolbar">
                  <div className="ln-plat-search" />
                  <div className="ln-plat-pill" /><div className="ln-plat-pill" />
                  <div className="ln-plat-add-btn">+ Add</div>
                </div>
                <div className="ln-plat-table">
                  <div className="ln-plat-thead" style={{ gridTemplateColumns: cur.cols }}>
                    {cur.headers.map(h => <div key={h} className="ln-plat-th">{h}</div>)}
                  </div>
                  {cur.rows.map((row, ri) => (
                    <div key={ri} className="ln-plat-tr" style={{ gridTemplateColumns: cur.cols }}>
                      {row.map((cell, ci) => (
                        <div key={ci} className={`ln-plat-td${
                          (cell === "PAID" || cell === "CONFIRMED") ? " green" :
                          cell === "UNPAID" ? " red" :
                          cell === "DRAFT" ? " amber" : ""
                        }`}>{cell}</div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="ln-plat-pagination">Showing 1–5 of 5 · Page 1 / 1</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   COMPARISON TABLE
───────────────────────────────────────────────────────────── */
function ComparisonSection() {
  const rows = [
    { label: "Tax Billing",                jedmee: true,  sheet: "partial", manual: false },
    { label: "Batch & Expiry Tracking",    jedmee: true,  sheet: "partial", manual: false },
    { label: "Online Order Management",    jedmee: true,  sheet: false,     manual: false },
    { label: "Customer Credit Management", jedmee: true,  sheet: "partial", manual: false },
    { label: "Supplier Payment Tracking",  jedmee: true,  sheet: "partial", manual: false },
    { label: "Real-time Stock Alerts",     jedmee: true,  sheet: false,     manual: false },
    { label: "Sales & Profit Reports",     jedmee: true,  sheet: "partial", manual: false },
    { label: "Multi-user Access",          jedmee: true,  sheet: false,     manual: false },
    { label: "Cloud Backup",               jedmee: true,  sheet: false,     manual: false },
    { label: "Mobile Friendly",            jedmee: true,  sheet: "partial", manual: false },
  ];
  const Cell = ({ val }) => (
    <div className={`ln-cmp-cell ${val === true ? "yes" : val === "partial" ? "partial" : "no"}`}>
      {val === true ? "✓" : val === "partial" ? "~" : "✗"}
    </div>
  );
  return (
    <section className="ln-comparison">
      <div className="ln-container">
        <div className="ln-section-label">Why Switch</div>
        <h2 className="ln-section-title">JedMee vs The Old Way</h2>
        <p className="ln-section-sub">See why medicine shops switched from spreadsheets and paper to JedMee.</p>
        <div className="ln-cmp-wrap">
          <div className="ln-cmp-table">
            <div className="ln-cmp-head">
              <div className="ln-cmp-hf">Feature</div>
              <div className="ln-cmp-hc ln-cmp-hc--star">JedMee</div>
              <div className="ln-cmp-hc">Spreadsheet</div>
              <div className="ln-cmp-hc">Paper / Manual</div>
            </div>
            {rows.map((r, i) => (
              <div key={i} className={`ln-cmp-row${i % 2 === 0 ? " alt" : ""}`}>
                <div className="ln-cmp-feature">{r.label}</div>
                <Cell val={r.jedmee} />
                <Cell val={r.sheet} />
                <Cell val={r.manual} />
              </div>
            ))}
          </div>
        </div>
        <p className="ln-cmp-note">
          <Icon name="sparkle" size={13} /> JedMee replaces all manual processes with one simple, connected system.
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   TESTIMONIALS
───────────────────────────────────────────────────────────── */
function TestimonialsSection() {
  const testimonials = [
    {
      quote: "Before JedMee, I was spending nearly 2 hours every evening just on billing and stock entries. Now my entire day's billing is done in under 30 minutes. Tax invoices print perfectly, customers get a copy instantly, and I haven't had a single expired batch slip through in over 8 months. I genuinely wish I had switched sooner.",
      name: "Adam Davis",
      role: "Proprietor, Davis Medical & General Store · Austin, TX",
      initials: "AD",
      rating: 5,
    },
    {
      quote: "We supply to 60+ retail pharmacies. Managing their orders over phone was a constant mess — wrong quantities, missed items, endless follow-up calls. With JedMee's order catalog, retailers place orders themselves and I confirm in one click. Our dispatch errors dropped to almost zero within the first month.",
      name: "Victor Nash",
      role: "Owner, Nash Pharma Distributors · Toronto, Canada",
      initials: "VN",
      rating: 5,
    },
    {
      quote: "The expiry tracking alone is worth every dollar. We used to write off $1,500–2,000 in expired stock every quarter. Last quarter it was under $200. JedMee alerts us 60 days before expiry so we have time to return or sell the stock — that's real money saved.",
      name: "Sarah Mitchell",
      role: "Manager, Mitchell Pharmacy · Phoenix, AZ",
      initials: "SA",
      rating: 5,
    },
  ];
  return (
    <section className="ln-testimonials">
      <div className="ln-container">
        <div className="ln-section-label">Customer Stories</div>
        <h2 className="ln-section-title">Real Pharmacies. Real Results.</h2>
        <p className="ln-section-sub">See how medicine shops and distributors around the world are saving time, reducing losses, and growing with JedMee.</p>
        <div className="ln-testi-layout">
          <div className="ln-testi-featured">
            <div className="ln-testi-stars">{[1,2,3,4,5].map(i => <Icon key={i} name="star" size={14} className="ln-star" />)}</div>
            <blockquote className="ln-testi-quote">"{testimonials[0].quote}"</blockquote>
            <div className="ln-testi-author">
              <div className="ln-testi-avatar">{testimonials[0].initials}</div>
              <div>
                <div className="ln-testi-name">{testimonials[0].name}</div>
                <div className="ln-testi-role">{testimonials[0].role}</div>
              </div>
            </div>
            <div className="ln-testi-score">
              <span className="ln-testi-score-num">4.9</span>
              <span className="ln-testi-score-label">/ 5 · Rated by 500+ pharmacies</span>
            </div>
          </div>
          <div className="ln-testi-stack">
            {testimonials.slice(1).map((t, i) => (
              <div key={i} className="ln-testi-mini">
                <div className="ln-testi-mini-stars">{Array.from({length: t.rating}).map((_, j) => <Icon key={j} name="star" size={11} className="ln-star" />)}</div>
                <blockquote className="ln-testi-mini-quote">"{t.quote}"</blockquote>
                <div className="ln-testi-mini-author">
                  <div className="ln-testi-mini-avatar">{t.initials}</div>
                  <div>
                    <div className="ln-testi-mini-name">{t.name}</div>
                    <div className="ln-testi-mini-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   PRICING
───────────────────────────────────────────────────────────── */

/** Currency symbol map keyed by ISO 4217 code — matches backend formatPlan(). */
const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£", INR: "₹", AUD: "A$", CAD: "C$" };

/** Format price string returned by the API (already pre-formatted by backend).
 *  Numeric fallback uses currencyCode from plan.currency_code. */
function fmtPrice(price, period, currencyCode = "USD") {
  if (typeof price === "string") return price;
  const n = parseFloat(price);
  if (n === 0 || period === "free") return "Free";
  const sym = CURRENCY_SYMBOLS[currencyCode] ?? "$";
  return sym + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function fmtPeriod(period) {
  if (typeof period === "string" && /month|trial|year|time/i.test(period)) return period;
  return { free: "14-day trial", monthly: "per month", yearly: "per year", one_time: "one time" }[period] ?? period;
}
function PricingSection({ navigate }) {
  const [plans, setPlans] = useState(null);   // null = loading, [] = error
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    setPlans(null);
    try {
      const resp = await getPublicPlans({ toast: "none" });
      if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
        setPlans(resp.json.data?.plans ?? []);
      } else {
        setPlans([]);
        setError(true);
      }
    } catch {
      setPlans([]);
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isLoading = plans === null;
  const displayPlans = plans ?? [];

  return (
    <section className="ln-pricing" id="pricing">
      <div className="ln-container">
        <div className="ln-section-label">Pricing</div>
        <h2 className="ln-section-title">Simple, Transparent Pricing</h2>
        <p className="ln-section-sub">Start free, upgrade when you're ready. No hidden fees.</p>
        {error && displayPlans.length === 0 ? (
          <div className="ln-pricing-error">
            <p>Pricing is temporarily unavailable. Please try again.</p>
            <button className="ln-btn ln-btn--outline" onClick={load}>Retry</button>
          </div>
        ) : (
          <div className={`ln-pricing-grid${isLoading ? " ln-pricing-grid--loading" : ""}`}>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="ln-plan-wrap">
                    <div className="ln-plan ln-plan--skeleton" />
                  </div>
                ))
              : displayPlans.map((plan, i) => (
                  <div key={plan.id ?? i} className="ln-plan-wrap">
                    <div className={`ln-plan${plan.highlight ? " ln-plan--hi" : ""}`}>
                      {plan.badge && <div className="ln-plan-badge">{plan.badge}</div>}
                      <div className="ln-plan-name">{plan.name}</div>
                      <div className="ln-plan-price">
                        <span className="ln-plan-amount">{fmtPrice(plan.price, plan.period, plan.currency_code)}</span>
                        <span className="ln-plan-period"> / {fmtPeriod(plan.period)}</span>
                      </div>
                      <p className="ln-plan-desc">{plan.description}</p>
                      <div className="ln-plan-divider" />
                      <ul className="ln-plan-features">
                        {(Array.isArray(plan.features) ? plan.features : []).map((f, j) => (
                          <li key={j}><Icon name="checkMark" size={13} className="ln-plan-check" /><span>{f}</span></li>
                        ))}
                      </ul>
                      <button
                        className={`ln-btn ln-btn--lg ${plan.highlight ? "ln-btn--primary" : "ln-btn--outline"} ln-plan-cta`}
                        onClick={() => navigate("/login")}>
                        {plan.cta} <Icon name="arrow" size={15} />
                      </button>
                    </div>
                  </div>
                ))
            }
          </div>
        )}
        <p className="ln-pricing-note">
          <Icon name="shield" size={14} /> All plans include tax compliance, data security, and automated backups.
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   FAQ
───────────────────────────────────────────────────────────── */
function FAQSection() {
  const [open, setOpen] = useState(null);
  const faqs = [
    { q: "Can both medicine shops and distributors use JedMee?", a: "Yes. Medicine shops get billing, stock, and order tools. Distributors get a product catalog, order management, and dispatch tracking." },
    { q: "Does JedMee handle tax billing for my country?", a: "Yes. JedMee creates fully tax-compliant invoices automatically. Set the tax rate per product and the system calculates the tax for you. It supports GST, VAT, Sales Tax, and other tax systems." },
    { q: "How does expiry tracking work?", a: "Each medicine can have multiple batches with expiry dates. JedMee alerts you before any batch expires so you can act in time." },
    { q: "Can I add my existing medicines and data?", a: "Yes. Import medicines, batches, customers, and suppliers from a CSV file — no manual entry needed." },
    { q: "How do retailers order from wholesalers?", a: "Wholesalers add medicines to an online catalog. Retailers browse, add to cart, and place orders. The wholesaler confirms inside JedMee." },
    { q: "Is my business data safe?", a: "Yes. All data is encrypted and stored securely. We maintain 99.9% uptime and take regular backups." },
  ];
  return (
    <section className="ln-faq">
      <div className="ln-container ln-faq-inner">
        <div className="ln-faq-header">
          <div className="ln-section-label">FAQ</div>
          <h2 className="ln-section-title" style={{textAlign:"left"}}>Frequently Asked Questions</h2>
        </div>
        <div className="ln-faq-list">
          {faqs.map((f, i) => (
            <div key={i} className={`ln-faq-item${open === i ? " open" : ""}`}>
              <button className="ln-faq-q" onClick={() => setOpen(open === i ? null : i)}>
                <span>{f.q}</span>
                <Icon name={open === i ? "chevronD" : "chevronR"} size={17} />
              </button>
              {open === i && <div className="ln-faq-a">{f.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   CTA SECTION
───────────────────────────────────────────────────────────── */
function CTASection({ navigate }) {
  return (
    <section className="ln-cta">
      <div className="ln-cta-bg">
        <div className="ln-cta-orb ln-cta-orb--1" />
        <div className="ln-cta-orb ln-cta-orb--2" />
      </div>
      <div className="ln-container ln-cta-inner">
        <div className="ln-cta-badge"><Icon name="sparkle" size={14} /> Ready to simplify your pharmacy?</div>
        <h2 className="ln-cta-title">Start Managing Your Pharmacy<br />the Smart Way — Today</h2>
        <p className="ln-cta-sub">Join thousands of pharmacies worldwide already using JedMee.</p>
        <div className="ln-cta-actions">
          <button className="ln-btn ln-btn--white ln-btn--lg" onClick={() => navigate("/login")}>
            Get Started Free <Icon name="arrow" size={18} />
          </button>
          <a className="ln-btn ln-btn--outline-white ln-btn--lg" href="#features">Explore Features</a>
        </div>
        <div className="ln-cta-trust">
          {["No credit card required", "Free setup assistance", "Cancel anytime"].map(t => (
            <span key={t}><Icon name="checkMark" size={13} /> {t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   FOOTER
───────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="ln-footer">
      <div className="ln-container">
        <div className="ln-footer-top">
          <div className="ln-footer-brand">
            <img src="/logo.png" alt="JedMee" className="ln-footer-logo" />
            <p className="ln-footer-tagline">Simple, powerful software for pharmacies and distributors worldwide.</p>
            <div className="ln-footer-badges">
              {[["shield","Tax Compliant"],["lock","Secure"],["globe","Cloud-Based"]].map(([icon, label]) => (
                <span key={label} className="ln-footer-badge"><Icon name={icon} size={12} />{label}</span>
              ))}
            </div>
          </div>
          <div className="ln-footer-col">
            <div className="ln-footer-col-title">Platform</div>
            <ul>
              <li><a href="#features">Features</a></li>
              <li><a href="#workflow">How It Works</a></li>
              <li><a href="#platform">Platform Preview</a></li>
              <li><a href="#pricing">Pricing</a></li>
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
          <span>Built for pharmacies worldwide</span>
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN LANDING PAGE
───────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();
  const authed = Boolean(readAuth()?.refreshToken);

  useSeoMeta({
    title: "Pharmacy Management Software | Billing, Inventory & Stock Control",
    description:
      "JedMee is pharmacy management software for medicine shops and distributors worldwide. Tax billing, inventory tracking, expiry alerts, purchase orders and sales invoices — all in one simple app. Free plan available, no credit card required.",
    keywords:
      "pharmacy management software, medicine shop software, pharmacy billing software, medical store management software, pharmacy inventory software, drug store software, pharmacy POS software, medicine distributor software, online pharmacy management system, pharmacy stock management, medicine expiry tracking, wholesale pharma software, chemist shop software, pharmacy ERP, pharmacy invoicing software, pharmacy business software",
    canonical: "https://jedmee.com/",
  });

  useEffect(() => {
    window.scrollTo(0, 0);

    /* ── Helpers ── */
    const onScroll = (el, from, to) => {
      if (!el) return;
      gsap.set(el, from);
      ScrollTrigger.create({
        trigger: el, start: "top 88%", once: true,
        onEnter: () => gsap.to(el, { ...to, ease: to.ease || "power3.out" }),
      });
    };
    const onScrollSel = (sel, from, to) => onScroll(document.querySelector(sel), from, to);
    const onBatch = (sel, from, to, stagger = 0.1) => {
      gsap.set(sel, from);
      ScrollTrigger.batch(sel, {
        start: "top 90%", once: true,
        onEnter: batch => gsap.to(batch, { ...to, stagger, ease: to.ease || "power3.out" }),
      });
    };

    /* ── NAV ── */
    gsap.set(".ln-nav", { opacity: 0, y: -28 });
    gsap.to(".ln-nav", { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", delay: 0.05 });

    /* ── HERO ── */
    gsap.set([".ln-hero-badge",".ln-hero-title",".ln-hero-sub",".ln-hero-ctas",".ln-hero-proof",".ln-hero-trust"], { opacity: 0, y: 30 });
    gsap.set(".ln-hero-visual", { opacity: 0, x: 60, scale: 0.94 });
    gsap.set(".ln-dash-float", { opacity: 0, y: 20, scale: 0.9 });

    const tl = gsap.timeline({ delay: 0.18 });
    tl.to(".ln-hero-badge",  { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.5)" })
      .to(".ln-hero-title",  { opacity: 1, y: 0, duration: 0.65, ease: "power4.out" }, "-=0.25")
      .to(".ln-hero-sub",    { opacity: 1, y: 0, duration: 0.5,  ease: "power3.out" }, "-=0.35")
      .to(".ln-hero-ctas",   { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, "-=0.3")
      .to(".ln-hero-proof",  { opacity: 1, y: 0, duration: 0.4,  ease: "power3.out" }, "-=0.25")
      .to(".ln-hero-trust",  { opacity: 1, y: 0, duration: 0.4,  ease: "power3.out" }, "-=0.25")
      .to(".ln-hero-visual", { opacity: 1, x: 0, scale: 1, duration: 0.9, ease: "power4.out" }, 0.25)
      .to(".ln-dash-float",  { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.12, ease: "back.out(1.6)" }, "-=0.5");

    /* ── SECTIONS ── */
    onBatch(".ln-section-label", { opacity: 0, y: 14, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.45 }, 0.05);
    onBatch(".ln-section-title", { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.6 }, 0.05);
    onBatch(".ln-section-sub",   { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5 }, 0.05);

    /* ── STATS ── */
    onBatch(".ln-stat", { opacity: 0, y: 40, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "back.out(1.2)" }, 0.1);

    /* ── PROBLEM ROWS ── */
    document.querySelectorAll(".ln-problem-row").forEach((el, i) => {
      onScroll(el, { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 0.5, delay: i * 0.07 });
    });

    /* ── FEATURES ── */
    document.querySelectorAll(".ln-feat").forEach((el, i) => {
      const col = i % 4;
      const xDir = col < 2 ? -60 : 60;
      onScroll(el, { opacity: 0, x: xDir, scale: 0.96 }, { opacity: 1, x: 0, scale: 1, duration: 0.6, delay: (col < 2 ? col : col - 2) * 0.07 });
    });

    /* ── COMPARISON ── */
    onScrollSel(".ln-cmp-head", { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.5 });
    document.querySelectorAll(".ln-cmp-row").forEach((el, i) => {
      onScroll(el, { opacity: 0, x: i % 2 === 0 ? -40 : 40 }, { opacity: 1, x: 0, duration: 0.4, delay: i * 0.025 });
    });

    /* ── WORKFLOW ── */
    document.querySelectorAll(".ln-wf-node").forEach((el, i) => {
      onScroll(el, { opacity: 0, y: 40, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "back.out(1.1)", delay: i * 0.1 });
    });

    /* ── PLATFORM ── */
    onScrollSel(".ln-plat-tabs", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45 });
    onScrollSel(".ln-plat-window", { opacity: 0, y: 50, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power4.out" });

    /* ── TESTIMONIALS ── */
    onScrollSel(".ln-testi-featured", { opacity: 0, x: -50, scale: 0.96 }, { opacity: 1, x: 0, scale: 1, duration: 0.65 });
    onBatch(".ln-testi-mini", { opacity: 0, x: 50, scale: 0.95 }, { opacity: 1, x: 0, scale: 1, duration: 0.55, ease: "back.out(1.1)" }, 0.12);

    /* ── PRICING ── */
    onBatch(".ln-plan", { opacity: 0, y: 50, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.65, ease: "back.out(1.1)" }, 0.14);

    /* ── FAQ ── */
    onScrollSel(".ln-faq-header", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.6 });
    document.querySelectorAll(".ln-faq-item").forEach((el, i) => {
      onScroll(el, { opacity: 0, x: -35 }, { opacity: 1, x: 0, duration: 0.45, delay: i * 0.05 });
    });

    /* ── CTA ── */
    onScrollSel(".ln-cta-badge",   { opacity: 0, y: 18, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.4)" });
    onScrollSel(".ln-cta-title",   { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.6 });
    onScrollSel(".ln-cta-sub",     { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.45 });
    onScrollSel(".ln-cta-actions", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4 });
    onScrollSel(".ln-cta-trust",   { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35 });

    /* ── FOOTER ── */
    onScrollSel(".ln-footer-brand", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.55 });
    onBatch(".ln-footer-col", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.45 }, 0.08);

    /* ── 3D TILT ── */
    const addTilt = () => {
      const cards = document.querySelectorAll(".ln-feat, .ln-stat, .ln-plan, .ln-testi-featured, .ln-testi-mini");
      const onMove = (e) => {
        const c = e.currentTarget;
        const r = c.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width - 0.5) * 10;
        const y = ((e.clientY - r.top) / r.height - 0.5) * -10;
        gsap.to(c, { rotateX: y, rotateY: x, duration: 0.25, ease: "power2.out", transformPerspective: 900 });
      };
      const onLeave = (e) => gsap.to(e.currentTarget, { rotateX: 0, rotateY: 0, duration: 0.45, ease: "power3.out" });
      cards.forEach(c => { c.addEventListener("mousemove", onMove); c.addEventListener("mouseleave", onLeave); });
      return () => cards.forEach(c => { c.removeEventListener("mousemove", onMove); c.removeEventListener("mouseleave", onLeave); });
    };
    const timer = setTimeout(addTilt, 600);

    return () => {
      clearTimeout(timer);
      ScrollTrigger.getAll().forEach(t => t.kill());
    };
  }, []);

  return (
    <div className="ln-root">
      <LandingNav navigate={navigate} authed={authed} />
      <HeroSection navigate={navigate} />
      <TrustedBySection />
      <StatsSection />
      <ProblemSection />
      <FeaturesSection />
      <WorkflowSection />
      <PlatformSection />
      <ComparisonSection />
      <TestimonialsSection />
      <PricingSection navigate={navigate} />
      <FAQSection />
      <CTASection navigate={navigate} />
      <Footer />
    </div>
  );
}