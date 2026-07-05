import React, { useCallback, useEffect, useRef, useState } from "react";
import { getCurrencySymbol } from "../utils/currency.js";
import { useNavigate, Link } from "react-router-dom";
import { readAuth } from "../services/authStorage.js";
import { getPublicPlans } from "../services/plansService.js";
import { useSeoMeta, useJsonLd } from "../utils/seo.js";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./LandingPage.css";

gsap.registerPlugin(ScrollTrigger);

/* ─────────────────────────────────────────────────────────────
   SEO CONFIG — single source of truth for all dynamic values
   Update this object whenever contact info, pricing, or ratings change.
   These values feed BOTH the visible UI and the JSON-LD schema below.
───────────────────────────────────────────────────────────── */
const SEO_CONFIG = {
  siteName:       "JedMee",
  siteUrl:        "https://jedmee.com",
  supportEmail:   "supportjedmee@gmail.com",
  foundingYear:   "2024",
  ratingValue:    "4.9",
  reviewCount:    "500",
  pharmacyCount:  "500+",
  billsCreated:   "2M+",
  plans: [
    { name: "Starter",      price: "0",  priceCurrency: "USD", period: "free",    description: "Free 14-day trial for small medicine shops — no credit card required" },
    { name: "Growth",       price: "9",  priceCurrency: "USD", period: "monthly", description: "For growing pharmacies and medicine shops needing full features" },
    { name: "Professional", price: "19", priceCurrency: "USD", period: "monthly", description: "For established pharmacies and distributors" },
    { name: "Enterprise",   price: "39", priceCurrency: "USD", period: "monthly", description: "For large pharmacy chains and wholesale distributors" },
  ],
  /* Canonical FAQs — used in schema AND the visible FAQ section.
     Only ONE set exists — no duplication possible. */
  faqs: [
    {
      q: "Can both medicine shops and distributors use JedMee?",
      a: "Yes. Medicine shops get billing, stock, and order tools. Distributors get a product catalog, order management, and dispatch tracking.",
    },
    {
      q: "Does JedMee handle tax billing for my country?",
      a: "Yes. JedMee creates fully tax-compliant invoices automatically. Set the tax rate per product and the system calculates the tax for you. It supports GST, VAT, Sales Tax, and other tax systems.",
    },
    {
      q: "How does expiry tracking work?",
      a: "Each medicine can have multiple batches with expiry dates. JedMee alerts you before any batch expires so you can act in time.",
    },
    {
      q: "Can I add my existing medicines and data?",
      a: "Yes. Import medicines, batches, customers, and suppliers from a CSV file — no manual entry needed.",
    },
    {
      q: "How do retailers order from wholesalers?",
      a: "Wholesalers add medicines to an online catalog. Retailers browse, add to cart, and place orders. The wholesaler confirms inside JedMee.",
    },
    {
      q: "Is my business data safe?",
      a: "Yes. All data is encrypted and stored securely. We maintain 99.9% uptime and take regular backups.",
    },
  ],
};

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
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  const links = [
    { label: "Features", href: "#features" },
    { label: "Pricing",  href: "#pricing" },
    { label: "Download", href: "#download" },
    { label: "About",    to: "/about" },
    { label: "Contact",  to: "/contact" },
  ];
  return (
    <>
      <nav className={`ln-nav${scrolled ? " ln-nav--solid" : ""}${open ? " ln-nav--open" : ""}`}>
        <div className="ln-nav-inner">
          <a className="ln-nav-logo" href="#top">
            <img src="/logo.png" alt="JedMee pharmacy management software logo" className="ln-nav-logo-img" />
          </a>
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
              <span className="ln-hero-proof-count">{SEO_CONFIG.pharmacyCount}</span> pharmacies trust JedMee
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
      <div className="ln-mock-side">
        <div className="ln-mock-logo">
          <img src="/logo.png" alt="JedMee pharmacy management software logo" className="ln-mock-logo-img" />
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
    { icon: "building", val: 500,  suffix: "+",   label: "Pharmacies",  sub: "Using JedMee",     color: "#6b3fa0" },
    { icon: "receipt",  val: 2,    suffix: "M+",   label: "Bills Created", sub: "& Printed",      color: "#0ea5e9" },
    { icon: "zap",      val: 40,   suffix: "%",    label: "Time Saved",  sub: "Every Day",        color: "#f97316" },
    { icon: "shield",   val: 99,   suffix: ".9%",  label: "Uptime",      sub: "Always Available", color: "#22c55e" },
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
              <div className="ln-plat-side-logo"><img src="/logo.png" alt="JedMee pharmacy management software logo" className="ln-plat-side-logo-img" /></div>
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
        <p className="ln-section-sub">
          See how medicine shops and distributors around the world are saving time, reducing losses, and growing with JedMee.
        </p>
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
              <span className="ln-testi-score-num">{SEO_CONFIG.ratingValue}</span>
              <span className="ln-testi-score-label">/ 5 · Rated by {SEO_CONFIG.reviewCount}+ pharmacies</span>
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
const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£", INR: "₹", AUD: "A$", CAD: "C$" };

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
  const [plans, setPlans] = useState(null);
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
   FAQ — renders from SEO_CONFIG.faqs (single source of truth)
───────────────────────────────────────────────────────────── */
function FAQSection() {
  const [open, setOpen] = useState(null);
  return (
    <section className="ln-faq">
      <div className="ln-container ln-faq-inner">
        <div className="ln-faq-header">
          <div className="ln-section-label">FAQ</div>
          <h2 className="ln-section-title" style={{textAlign:"left"}}>Frequently Asked Questions</h2>
        </div>
        <div className="ln-faq-list">
          {SEO_CONFIG.faqs.map((f, i) => (
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
   DOWNLOAD APP SECTION
───────────────────────────────────────────────────────────── */
function DownloadSection() {
  const [appInfo, setAppInfo] = useState({
    version: "1.0.0", buildDateHuman: "",
    android: { available: false, apkUrl: "", sizeMB: "0" },
    ios: { available: false }
  });
  const [dlState, setDlState] = useState("idle"); // idle | downloading | done

  useEffect(() => {
    fetch("/downloads/version.json")
      .then(r => r.json())
      .then(d => setAppInfo(d))
      .catch(() => {});
  }, []);

  const handleAndroidDownload = (e) => {
    if (!appInfo.android.available) { e.preventDefault(); return; }
    setDlState("downloading");
    setTimeout(() => setDlState("done"), 1800);
  };

  const barHeights = [45, 65, 50, 80, 60, 88, 72];

  return (
    <section className="ln-download" id="download">
      {/* Background */}
      <div className="ln-dl-bg">
        <div className="ln-dl-orb ln-dl-orb--1" />
        <div className="ln-dl-orb ln-dl-orb--2" />
        <div className="ln-dl-grid" />
      </div>

      <div className="ln-container">
        {/* Section header — centered */}
        <div className="ln-dl-header">
          <div className="ln-dl-badge">
            <Icon name="zap" size={13} />
            <span>Mobile App — Free Download</span>
          </div>
          <h2 className="ln-dl-title">
            Your Pharmacy, Always<br />
            <span className="ln-dl-title-accent">In Your Pocket</span>
          </h2>
          <p className="ln-dl-sub">
            Manage billing, stock, and orders from your Android phone. Fast, lightweight, and free.
          </p>
        </div>

        {/* Main card row */}
        <div className="ln-dl-inner">

          {/* ── Left: phone mockup ── */}
          <div className="ln-dl-visual">
            <div className="ln-dl-float ln-dl-float--1">
              <Icon name="checkCircle" size={14} className="ln-dl-fi-green" />
              <div>
                <div className="ln-dl-float-label">Invoice Created</div>
                <div className="ln-dl-float-val">₹24,850</div>
              </div>
            </div>
            <div className="ln-dl-float ln-dl-float--2">
              <Icon name="trending" size={14} className="ln-dl-fi-indigo" />
              <div>
                <div className="ln-dl-float-label">Today's Sales</div>
                <div className="ln-dl-float-val">↑ 12%</div>
              </div>
            </div>

            <div className="ln-dl-phone-wrap">
              <div className="ln-dl-phone-glow" />
              <div className="ln-dl-phone">
                {/* Status bar */}
                <div className="ln-dl-statusbar">
                  <span className="ln-dl-sb-time">9:41</span>
                  <div className="ln-dl-sb-icons">
                    <div className="ln-dl-sb-signal"><div/><div/><div/><div/></div>
                    <div className="ln-dl-sb-battery" />
                  </div>
                </div>
                <div className="ln-dl-phone-screen">
                  {/* App top bar */}
                  <div className="ln-dl-app-header">
                    <div className="ln-dl-app-logo">JedMee</div>
                    <div className="ln-dl-app-header-right">
                      <div className="ln-dl-app-notif">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                        </svg>
                        <div className="ln-dl-notif-dot" />
                      </div>
                      <div className="ln-dl-app-avatar">RK</div>
                    </div>
                  </div>

                  {/* Greeting */}
                  <div className="ln-dl-app-body">
                    <div className="ln-dl-scroll-content">

                      {/* Greeting */}
                      <div className="ln-dl-greeting">
                        <div className="ln-dl-greeting-text">Good morning, Raj 👋</div>
                        <div className="ln-dl-greeting-sub">Today · May 27, 2026</div>
                      </div>

                      {/* Date filter tabs */}
                      <div className="ln-dl-tabs">
                        {["Today","This week","This month"].map((t, i) => (
                          <div key={t} className={`ln-dl-tab${i === 2 ? " active" : ""}`}>{t}</div>
                        ))}
                      </div>

                      {/* 5 KPI cards — 2 columns */}
                      <div className="ln-dl-kpi-grid">
                        <div className="ln-dl-kpi ln-dl-kpi--blue">
                          <div className="ln-dl-kpi-dot ln-dl-kpi-dot--blue" />
                          <div className="ln-dl-kpi-label">Period Sales</div>
                          <div className="ln-dl-kpi-val">₹34,818</div>
                        </div>
                        <div className="ln-dl-kpi ln-dl-kpi--gray">
                          <div className="ln-dl-kpi-dot ln-dl-kpi-dot--gray" />
                          <div className="ln-dl-kpi-label">Purchases</div>
                          <div className="ln-dl-kpi-val">₹8.2K</div>
                        </div>
                        <div className="ln-dl-kpi ln-dl-kpi--green">
                          <div className="ln-dl-kpi-dot ln-dl-kpi-dot--green" />
                          <div className="ln-dl-kpi-label">Receivables</div>
                          <div className="ln-dl-kpi-val">₹705</div>
                        </div>
                        <div className="ln-dl-kpi ln-dl-kpi--red">
                          <div className="ln-dl-kpi-dot ln-dl-kpi-dot--red" />
                          <div className="ln-dl-kpi-label">Payables</div>
                          <div className="ln-dl-kpi-val">₹50K</div>
                        </div>
                        <div className="ln-dl-kpi ln-dl-kpi--purple ln-dl-kpi--wide">
                          <div className="ln-dl-kpi-dot ln-dl-kpi-dot--purple" />
                          <div className="ln-dl-kpi-label">Gross Profit</div>
                          <div className="ln-dl-kpi-val">₹16.6K <span className="ln-dl-kpi-trend up">↑ 8%</span></div>
                        </div>
                      </div>

                      {/* Alerts section */}
                      <div className="ln-dl-section-card">
                        <div className="ln-dl-section-head">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          <span>Alerts</span>
                        </div>
                        {[
                          { name: "Paracetamol Batch 99", sub: "Exp: May 29 · Stock: 899" },
                          { name: "Amoxicillin Batch 77", sub: "Exp: Jun 01 · Stock: 814" },
                        ].map((a, i) => (
                          <div key={i} className="ln-dl-alert-item">
                            <div className="ln-dl-alert-item-icon">
                              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            </div>
                            <div className="ln-dl-alert-item-info">
                              <div className="ln-dl-alert-item-name">{a.name}</div>
                              <div className="ln-dl-alert-item-sub">{a.sub}</div>
                            </div>
                            <div className="ln-dl-exp-badge">Exp Soon</div>
                          </div>
                        ))}
                      </div>

                      {/* Quick Actions */}
                      <div className="ln-dl-section-card">
                        <div className="ln-dl-section-head">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#6b3fa0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                          <span>Quick Actions</span>
                        </div>
                        <div className="ln-dl-qa-grid">
                          {[
                            { label: "New Sale",  color: "blue",   svg: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 2 4 22 7 20 10 22 13 20 16 22 19 20 20 22 20 2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/></svg> },
                            { label: "Purchase", color: "purple", svg: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b3fa0" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> },
                            { label: "Customers",color: "green",  svg: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
                            { label: "Suppliers",color: "orange", svg: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> },
                            { label: "Reports",  color: "indigo", svg: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
                            { label: "Products", color: "teal",   svg: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
                          ].map(({ label, color, svg }) => (
                            <div key={label} className="ln-dl-qa-item">
                              <div className={`ln-dl-qa-icon ln-dl-qa-icon--${color}`}>{svg}</div>
                              <div className="ln-dl-qa-label">{label}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Weekly Sales Chart */}
                      <div className="ln-dl-chart">
                        <div className="ln-dl-chart-head">
                          <div className="ln-dl-chart-title">Weekly Sales</div>
                          <div className="ln-dl-chart-legend">
                            <span className="ln-dl-leg ln-dl-leg--blue" />Sales
                            <span className="ln-dl-leg ln-dl-leg--purple" />Buy
                          </div>
                        </div>
                        <svg viewBox="0 0 140 48" className="ln-dl-chart-svg" preserveAspectRatio="none">
                          {[12, 24, 36].map(y => (
                            <line key={y} x1="0" y1={y} x2="140" y2={y} stroke="rgba(107,63,160,.1)" strokeWidth="0.5" />
                          ))}
                          {[45,65,50,80,60,88,72].map((h, i) => {
                            const barH = (h / 100) * 38;
                            const x = i * 20 + 2;
                            return <rect key={`s${i}`} x={x} y={42 - barH} width="8" height={barH} rx="1.5" fill="url(#salesGrad2)" opacity="0.95" />;
                          })}
                          {[25,36,28,44,33,48,40].map((h, i) => {
                            const barH = (h / 100) * 38;
                            const x = i * 20 + 11;
                            return <rect key={`b${i}`} x={x} y={42 - barH} width="8" height={barH} rx="1.5" fill="url(#buyGrad2)" opacity="0.9" />;
                          })}
                          <line x1="0" y1="42" x2="140" y2="42" stroke="rgba(107,63,160,.2)" strokeWidth="0.5" />
                          {["M","T","W","T","F","S","S"].map((d, i) => (
                            <text key={d+i} x={i * 20 + 9.5} y="48" textAnchor="middle" fill="rgba(26,12,48,.3)" fontSize="4.5">{d}</text>
                          ))}
                          <defs>
                            <linearGradient id="salesGrad2" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#6366f1" />
                              <stop offset="100%" stopColor="#4338ca" />
                            </linearGradient>
                            <linearGradient id="buyGrad2" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#7c3aed" />
                              <stop offset="100%" stopColor="#5b21b6" />
                            </linearGradient>
                          </defs>
                        </svg>
                      </div>

                      {/* Recent Invoices */}
                      <div className="ln-dl-invoices">
                        <div className="ln-dl-inv-head">Recent Invoices</div>
                        {[
                          { no: "SI-042", name: "Walk-in",     amt: "₹1,250", status: "paid" },
                          { no: "SI-041", name: "Alex M.",     amt: "₹3,800", status: "unpaid" },
                          { no: "SI-040", name: "City Pharma", amt: "₹920",   status: "paid" },
                        ].map((inv, i) => (
                          <div key={i} className="ln-dl-inv-row">
                            <div className="ln-dl-inv-icon" />
                            <div className="ln-dl-inv-info">
                              <div className="ln-dl-inv-no">{inv.no}</div>
                              <div className="ln-dl-inv-name">{inv.name}</div>
                            </div>
                            <div className="ln-dl-inv-right">
                              <div className="ln-dl-inv-amt">{inv.amt}</div>
                              <div className={`ln-dl-inv-status ln-dl-inv-status--${inv.status}`}>{inv.status}</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Expiry alert bar */}
                      <div className="ln-dl-alert">
                        <div className="ln-dl-alert-dot" />
                        <span>2 batches expiring in 7 days</span>
                      </div>

                      {/* Profit card */}
                      <div className="ln-dl-section-card">
                        <div className="ln-dl-section-head">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                          <span>Profit</span>
                          <span className="ln-dl-profit-pct">8.0%</span>
                        </div>
                        {[
                          { label: "Revenue",      val: "₹34,818", color: "#6366f1" },
                          { label: "Gross profit", val: "₹16,650", color: "#16a34a" },
                        ].map((r, i) => (
                          <div key={i} className="ln-dl-profit-row">
                            <span className="ln-dl-profit-label">{r.label}</span>
                            <span className="ln-dl-profit-val" style={{ color: r.color }}>{r.val}</span>
                          </div>
                        ))}
                      </div>

                      {/* Top Products & Top Customers side by side */}
                      <div className="ln-dl-insights-row">
                        <div className="ln-dl-section-card ln-dl-insights-half">
                          <div className="ln-dl-section-head">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#6b3fa0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                            <span>Top Products</span>
                          </div>
                          {[
                            { r: 1, name: "Paracet…", val: "₹15.6K" },
                            { r: 2, name: "Amoxici…", val: "₹9.4K" },
                            { r: 3, name: "Ibupro…",  val: "₹7.7K" },
                          ].map((p) => (
                            <div key={p.r} className="ln-dl-rank-row">
                              <span className="ln-dl-rank">{p.r}</span>
                              <span className="ln-dl-rank-name">{p.name}</span>
                              <span className="ln-dl-rank-val">{p.val}</span>
                            </div>
                          ))}
                        </div>
                        <div className="ln-dl-section-card ln-dl-insights-half">
                          <div className="ln-dl-section-head">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#6b3fa0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            <span>Top Customers</span>
                          </div>
                          {[
                            { r: 1, name: "Hospital", val: "₹17.2K" },
                            { r: 2, name: "Test Lab",  val: "₹13.8K" },
                            { r: 3, name: "Norvan",    val: "₹3.6K" },
                          ].map((c) => (
                            <div key={c.r} className="ln-dl-rank-row">
                              <span className="ln-dl-rank">{c.r}</span>
                              <span className="ln-dl-rank-name">{c.name}</span>
                              <span className="ln-dl-rank-val">{c.val}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Expiry Watch */}
                      <div className="ln-dl-section-card">
                        <div className="ln-dl-section-head">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          <span>Expiry Watch</span>
                        </div>
                        {[
                          { name: "Paracetamol 500mg", batch: "B-099", days: "2 days", urgent: true },
                          { name: "Amoxicillin 250mg", batch: "B-077", days: "5 days", urgent: false },
                          { name: "Metformin 500mg",   batch: "B-044", days: "8 days", urgent: false },
                        ].map((e, i) => (
                          <div key={i} className="ln-dl-expiry-row">
                            <div className="ln-dl-expiry-info">
                              <div className="ln-dl-expiry-name">{e.name}</div>
                              <div className="ln-dl-expiry-batch">{e.batch}</div>
                            </div>
                            <div className={`ln-dl-expiry-days${e.urgent ? " urgent" : ""}`}>{e.days}</div>
                          </div>
                        ))}
                      </div>

                      {/* Stock Summary */}
                      <div className="ln-dl-section-card">
                        <div className="ln-dl-section-head">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#6b3fa0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                          <span>Stock Summary</span>
                        </div>
                        {[
                          { label: "Total Products", val: "248",  color: "#1a0c30" },
                          { label: "Low Stock",      val: "12",   color: "#d97706" },
                          { label: "Out of Stock",   val: "3",    color: "#dc2626" },
                          { label: "Expiring Soon",  val: "5",    color: "#d97706" },
                        ].map((s, i) => (
                          <div key={i} className="ln-dl-stock-row">
                            <span className="ln-dl-stock-label">{s.label}</span>
                            <span className="ln-dl-stock-val" style={{ color: s.color }}>{s.val}</span>
                          </div>
                        ))}
                      </div>

                    </div>
                  </div>

                  {/* Sidebar overlay — slides in/out during animation */}
                  <div className="ln-dl-sidebar">
                    {/* Header row: jedmee logo + close btn + avatar */}
                    <div className="ln-dl-sidebar-header">
                      <span className="ln-dl-sidebar-logo">jedmee</span>
                      <div className="ln-dl-sidebar-header-right">
                        <div className="ln-dl-sidebar-close">×</div>
                        <div className="ln-dl-sidebar-avatar ln-dl-sidebar-avatar--te">TE</div>
                      </div>
                    </div>

                    {/* Dashboard — active */}
                    <div className="ln-dl-sidebar-item active">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                      <span>Dashboard</span>
                    </div>

                    {/* MASTER DATA */}
                    <div className="ln-dl-sidebar-section-label">MASTER DATA</div>
                    {[
                      { label: "Products",      svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> },
                      { label: "Manufacturers", svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
                      { label: "Divisions",     svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg> },
                      { label: "Suppliers",     svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> },
                      { label: "Customers",     svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
                    ].map(({ label, svg }) => (
                      <div key={label} className="ln-dl-sidebar-item">{svg}<span>{label}</span></div>
                    ))}

                    {/* CATALOG */}
                    <div className="ln-dl-sidebar-section-label">CATALOG</div>
                    <div className="ln-dl-sidebar-item">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                      <span>My Catalog</span>
                    </div>

                    {/* TRANSACTIONS */}
                    <div className="ln-dl-sidebar-section-label">TRANSACTIONS</div>
                    {[
                      { label: "Sales & Billing",   svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 2 4 22 7 20 10 22 13 20 16 22 19 20 20 22 20 2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/></svg> },
                      { label: "Purchases",          svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> },
                      { label: "Sales Returns",      svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg> },
                      { label: "Purchase Returns",   svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 1 3 5 7 9"/><path d="M21 11V9a4 4 0 0 0-4-4H3"/><polyline points="17 23 21 19 17 15"/><path d="M3 13v2a4 4 0 0 0 4 4h14"/></svg> },
                      { label: "Orders",             svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
                    ].map(({ label, svg }) => (
                      <div key={label} className="ln-dl-sidebar-item">{svg}<span>{label}</span></div>
                    ))}

                    {/* REPORTS & ACCOUNTS */}
                    <div className="ln-dl-sidebar-section-label">REPORTS &amp; ACCOUNTS</div>
                    {[
                      { label: "Inventory Report",  svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
                      { label: "Day Book",           svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> },
                      { label: "GST Report (R1)",    svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="2"/><line x1="14" y1="18" x2="14" y2="7"/><line x1="18" y1="18" x2="18" y2="14"/></svg> },
                      { label: "GST ITC Report",     svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
                      { label: "GST Return (3B)",    svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
                      { label: "Ledger",             svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/></svg> },
                      { label: "Division Payments",  svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> },
                      { label: "Customer Payments",  svg: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
                    ].map(({ label, svg }) => (
                      <div key={label} className="ln-dl-sidebar-item">{svg}<span>{label}</span></div>
                    ))}

                    {/* Footer */}
                    <div className="ln-dl-sidebar-footer">
                      <span className="ln-dl-sidebar-footer-logo">JedMee</span>
                      <span className="ln-dl-sidebar-footer-sub">Pharmacy Platform</span>
                    </div>
                  </div>

                  {/* Bottom nav */}
                  <div className="ln-dl-bottom-nav">
                    {[
                      { icon: "chart", label: "Dashboard", active: true },
                      { icon: "receipt", label: "Bills" },
                      { icon: "package", label: "Stock" },
                      { icon: "users", label: "Customers" },
                    ].map(({ icon, label, active }) => (
                      <div key={label} className={`ln-dl-nav-item${active ? " active" : ""}`}>
                        <Icon name={icon} size={11} />
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: download content ── */}
          <div className="ln-dl-content">

            {/* Version pill */}
            <div className="ln-dl-version">
              <div className="ln-dl-version-dot" />
              <span className="ln-dl-version-text">
                Version <span className="ln-dl-version-num">v{appInfo.version}</span>
                {appInfo.buildDateHuman ? ` · ${appInfo.buildDateHuman}` : ""}
              </span>
            </div>

            {/* Feature list */}
            <ul className="ln-dl-features">
              {[
                ["receipt",     "Tax billing & invoicing in seconds"],
                ["package",     "Real-time stock & expiry tracking"],
                ["bell",        "Low-stock & expiry alerts"],
                ["barChart",    "Daily sales & profit reports"],
              ].map(([icon, text]) => (
                <li key={text} className="ln-dl-feature-item">
                  <span className="ln-dl-feature-icon"><Icon name={icon} size={14} /></span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>

            {/* Download buttons */}
            <div className="ln-dl-buttons">
              {/* Android APK — direct .apk download */}
              <a
                href={appInfo.android.available ? appInfo.android.apkUrl : "#download"}
                download={appInfo.android.available ? appInfo.android.fileName || `jedmee-v${appInfo.version}.apk` : undefined}
                className={`ln-dl-btn ln-dl-btn--android${!appInfo.android.available ? " ln-dl-btn--disabled" : ""}`}
                onClick={handleAndroidDownload}
                aria-label="Download JedMee APK for Android"
              >
                <div className="ln-dl-btn-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zm-2.5-1C2.67 17 2 17.67 2 18.5v5c0 .83.67 1.5 1.5 1.5S5 24.33 5 23.5v-5C5 17.67 4.33 17 3.5 17zm17 0c-.83 0-1.5.67-1.5 1.5v5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-5c0-.83-.67-1.5-1.5-1.5zM15.53 2.16l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85 1.23 12.95 1 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z" fill="white"/>
                  </svg>
                </div>
                <div className="ln-dl-btn-text">
                  <span className="ln-dl-btn-label">
                    {dlState === "downloading" ? "Starting download…" : dlState === "done" ? "Download started ✓" : "Download free for"}
                  </span>
                  <span className="ln-dl-btn-name">Android APK</span>
                  {appInfo.android.sizeMB && appInfo.android.sizeMB !== "0"
                    ? <span className="ln-dl-btn-size">{appInfo.android.sizeMB} MB · No sign-up needed</span>
                    : !appInfo.android.available
                      ? <span className="ln-dl-btn-size">Coming soon</span>
                      : null
                  }
                </div>
                <div className="ln-dl-btn-arrow">
                  {dlState === "done"
                    ? <Icon name="checkMark" size={18} />
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  }
                </div>
              </a>

              {/* iOS — dynamic: shows download when IPA is available, else "coming soon" */}
              <a
                href={appInfo.ios.available ? appInfo.ios.ipaUrl : "#download"}
                download={appInfo.ios.available ? appInfo.ios.fileName || `jedmee-v${appInfo.version}.ipa` : undefined}
                className={`ln-dl-btn ln-dl-btn--ios${!appInfo.ios.available ? " ln-dl-btn--disabled" : ""}`}
                aria-label={appInfo.ios.available ? "Download JedMee IPA for iOS" : "iOS App Store — coming soon"}
              >
                <div className="ln-dl-btn-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                </div>
                <div className="ln-dl-btn-text">
                  <span className="ln-dl-btn-label">
                    {appInfo.ios.available ? "Download free for" : "Coming soon on"}
                  </span>
                  <span className="ln-dl-btn-name">iOS / App Store</span>
                  {appInfo.ios.available && appInfo.ios.sizeMB && appInfo.ios.sizeMB !== "0"
                    ? <span className="ln-dl-btn-size">{appInfo.ios.sizeMB} MB · No sign-up needed</span>
                    : !appInfo.ios.available
                      ? <span className="ln-dl-btn-size">Currently in development</span>
                      : null
                  }
                </div>
                <div className="ln-dl-btn-arrow">
                  {appInfo.ios.available
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    : <Icon name="arrow" size={18} />
                  }
                </div>
              </a>
            </div>

            {/* Trust row */}
            <div className="ln-dl-trust">
              {[
                ["shield", "Safe & verified"],
                ["zap",    "No sign-up to install"],
                ["lock",   "Free forever"],
              ].map(([icon, label]) => (
                <div key={label} className="ln-dl-trust-item">
                  <Icon name={icon} size={12} /><span>{label}</span>
                </div>
              ))}
            </div>
          </div>
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
            <img src="/logo.png" alt="JedMee pharmacy management software logo" className="ln-footer-logo" />
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
              <li><a href="#download">Download App</a></li>
            </ul>
          </div>
          <div className="ln-footer-col">
            <div className="ln-footer-col-title">Company</div>
            <ul>
              <li><Link to="/about">About JedMee</Link></li>
              <li><Link to="/contact">Contact Us</Link></li>
              <li><Link to="/terms">Terms of Service</Link></li>
              <li><a href={`mailto:${SEO_CONFIG.supportEmail}`}>{SEO_CONFIG.supportEmail}</a></li>
            </ul>
          </div>
        </div>
        <div className="ln-footer-bottom">
          <span>© {SEO_CONFIG.foundingYear}–{new Date().getFullYear()} {SEO_CONFIG.siteName}. All rights reserved.</span>
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

  /* ── Page-level meta ── */
  useSeoMeta({
    title: "Pharmacy Management Software | Free Trial",
    description:
      "JedMee is pharmacy software for medicine shops and distributors. Tax billing, inventory tracking, expiry alerts, and invoicing — free trial, no credit card needed.",
    canonical: `${SEO_CONFIG.siteUrl}/`,
  });

  /*
   * ── JSON-LD ──────────────────────────────────────────────────────────
   *
   * IMPORTANT — schema ownership:
   *   • SoftwareApplication  → HERE only  (removed from index.html)
   *   • FAQPage              → HERE only  (removed from index.html)
   *   • WebPage              → HERE only
   *   • Organization         → index.html only
   *   • WebSite              → index.html only
   *   • BreadcrumbList       → index.html only
   *
   * This split eliminates every "Duplicate field" error in Search Console
   * because Google sees static + dynamic schemas merged per page.
   * ─────────────────────────────────────────────────────────────────── */
  useJsonLd([
    /* 1. WebPage */
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": `${SEO_CONFIG.siteName} — Pharmacy Management Software`,
      "url": `${SEO_CONFIG.siteUrl}/`,
      "description":
        "Cloud-based pharmacy management software for medicine shops and distributors worldwide. Tax billing, inventory tracking, expiry alerts, and invoicing — free trial.",
      "inLanguage": "en",
      "isPartOf": { "@type": "WebSite", "url": SEO_CONFIG.siteUrl },
      "breadcrumb": {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": `${SEO_CONFIG.siteUrl}/` },
        ],
      },
    },

    /* 2. SoftwareApplication — pricing pulled from SEO_CONFIG so it stays in sync */
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": SEO_CONFIG.siteName,
      "url": SEO_CONFIG.siteUrl,
      "logo": `${SEO_CONFIG.siteUrl}/logo.png`,
      "image": `${SEO_CONFIG.siteUrl}/logo-400.png`,
      "applicationCategory": "BusinessApplication",
      "applicationSubCategory": "Pharmacy Management Software",
      "operatingSystem": "Web, Android, iOS",
      "description":
        "JedMee is cloud-based pharmacy management software for medicine shops and distributors worldwide. Features include tax billing, inventory management, purchase orders, sales invoices, expiry tracking, customer ledgers, and vendor management.",
      "inLanguage": "en",
      "availableOnDevice": "Desktop, Mobile, Tablet",
      "keywords":
        "pharmacy management software, medicine shop software, pharmacy billing, medical store management, pharmacy inventory",
      "featureList": [
        "Tax-compliant billing and invoicing (GST, VAT, Sales Tax)",
        "Inventory management with expiry date tracking",
        "Purchase order and invoice management",
        "Sales invoice generation with batch tracking",
        "Customer and vendor ledgers",
        "Batch and lot tracking with low-stock alerts",
        "Prescription management for retail pharmacies",
        "Multi-user access with role-based permissions",
        "Cloud-based data storage with AWS",
        "Mobile-friendly responsive interface",
        "Wholesale-to-retail order catalog",
        "GST and tax reports (GSTR-1 compatible)",
        "Division and manufacturer management",
        "CSV bulk import for products and batches",
      ],
      "offers": {
        "@type": "AggregateOffer",
        "priceCurrency": "USD",
        "lowPrice": "0",
        "highPrice": SEO_CONFIG.plans[SEO_CONFIG.plans.length - 1].price,
        "offerCount": String(SEO_CONFIG.plans.length),
        "offers": SEO_CONFIG.plans.map(p => ({
          "@type": "Offer",
          "name": p.name,
          "price": p.price,
          "priceCurrency": p.priceCurrency,
          "description": p.description,
        })),
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": SEO_CONFIG.ratingValue,
        "bestRating": "5",
        "worstRating": "1",
        "reviewCount": SEO_CONFIG.reviewCount,
      },
      "publisher": {
        "@type": "Organization",
        "name": SEO_CONFIG.siteName,
        "url": SEO_CONFIG.siteUrl,
        "logo": { "@type": "ImageObject", "url": `${SEO_CONFIG.siteUrl}/logo.png` },
      },
    },

    /* 3. FAQPage — built directly from SEO_CONFIG.faqs; zero duplication risk */
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": SEO_CONFIG.faqs.map(f => ({
        "@type": "Question",
        "name": f.q,
        "acceptedAnswer": { "@type": "Answer", "text": f.a },
      })),
    },
  ]);

  useEffect(() => {
    window.scrollTo(0, 0);

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

    gsap.set(".ln-nav", { opacity: 0, y: -28 });
    gsap.to(".ln-nav", { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", delay: 0.05 });

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

    onBatch(".ln-section-label", { opacity: 0, y: 14, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.45 }, 0.05);
    onBatch(".ln-section-title", { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.6 }, 0.05);
    onBatch(".ln-section-sub",   { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5 }, 0.05);
    onBatch(".ln-stat", { opacity: 0, y: 40, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "back.out(1.2)" }, 0.1);

    document.querySelectorAll(".ln-problem-row").forEach((el, i) => {
      onScroll(el, { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 0.5, delay: i * 0.07 });
    });

    document.querySelectorAll(".ln-feat").forEach((el, i) => {
      const col = i % 4;
      const xDir = col < 2 ? -60 : 60;
      onScroll(el, { opacity: 0, x: xDir, scale: 0.96 }, { opacity: 1, x: 0, scale: 1, duration: 0.6, delay: (col < 2 ? col : col - 2) * 0.07 });
    });

    onScrollSel(".ln-cmp-head", { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.5 });
    document.querySelectorAll(".ln-cmp-row").forEach((el, i) => {
      onScroll(el, { opacity: 0, x: i % 2 === 0 ? -40 : 40 }, { opacity: 1, x: 0, duration: 0.4, delay: i * 0.025 });
    });

    document.querySelectorAll(".ln-wf-node").forEach((el, i) => {
      onScroll(el, { opacity: 0, y: 40, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "back.out(1.1)", delay: i * 0.1 });
    });

    onScrollSel(".ln-plat-tabs",   { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45 });
    onScrollSel(".ln-plat-window", { opacity: 0, y: 50, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power4.out" });

    onScrollSel(".ln-testi-featured", { opacity: 0, x: -50, scale: 0.96 }, { opacity: 1, x: 0, scale: 1, duration: 0.65 });
    onBatch(".ln-testi-mini", { opacity: 0, x: 50, scale: 0.95 }, { opacity: 1, x: 0, scale: 1, duration: 0.55, ease: "back.out(1.1)" }, 0.12);

    onBatch(".ln-plan", { opacity: 0, y: 50, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.65, ease: "back.out(1.1)" }, 0.14);

    onScrollSel(".ln-faq-header", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.6 });
    document.querySelectorAll(".ln-faq-item").forEach((el, i) => {
      onScroll(el, { opacity: 0, x: -35 }, { opacity: 1, x: 0, duration: 0.45, delay: i * 0.05 });
    });

    // Download section animations
    onScrollSel(".ln-dl-badge",   { opacity: 0, y: 14, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.5)" });
    onScrollSel(".ln-dl-title",   { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.6 });
    onScrollSel(".ln-dl-sub",     { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5 });
    onScrollSel(".ln-dl-version", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4 });
    onBatch(".ln-dl-btn",         { opacity: 0, x: -30, scale: 0.96 }, { opacity: 1, x: 0, scale: 1, duration: 0.5, ease: "back.out(1.2)" }, 0.12);
    onScrollSel(".ln-dl-qr-wrap", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45 });
    onBatch(".ln-dl-trust-item",  { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35 }, 0.07);
    onScrollSel(".ln-dl-phone-wrap", { opacity: 0, x: 60, scale: 0.92 }, { opacity: 1, x: 0, scale: 1, duration: 0.9, ease: "power4.out" });
    onBatch(".ln-dl-float",       { opacity: 0, y: 20, scale: 0.88 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, 0.15);

    onScrollSel(".ln-cta-badge",   { opacity: 0, y: 18, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.4)" });
    onScrollSel(".ln-cta-title",   { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.6 });
    onScrollSel(".ln-cta-sub",     { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.45 });
    onScrollSel(".ln-cta-actions", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4 });
    onScrollSel(".ln-cta-trust",   { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35 });

    onScrollSel(".ln-footer-brand", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.55 });
    onBatch(".ln-footer-col", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.45 }, 0.08);

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
      <DownloadSection />
      <CTASection navigate={navigate} />
      <Footer />
    </div>
  );
}