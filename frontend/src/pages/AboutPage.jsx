import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import LandingLayout from "../components/LandingLayout.jsx";
import { useSeoMeta } from "../utils/seo.js";
import "./LandingPage.css";
import "./InnerPages.css";

/* ── SVG Icon (subset) ── */
function Icon({ name, size = 20 }) {
  const p = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round",
    strokeLinejoin: "round", className: "ln-icon",
  };
  const icons = {
    arrow:   <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    shield:  <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    zap:     <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    users:   <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    globe:   <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
    lock:    <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    heart:   <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
    check:   <><polyline points="20 6 9 17 4 12"/></>,
  };
  return <svg {...p}>{icons[name] || null}</svg>;
}

/* ── Animated counter ── */
function Counter({ end, suffix = "" }) {
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
          const p = Math.min((n - s) / 1800, 1);
          const v = Math.floor((1 - Math.pow(1 - p, 3)) * end);
          el.textContent = v + suffix;
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        obs.unobserve(el);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [end, suffix]);
  return <span ref={ref}>0{suffix}</span>;
}

export default function AboutPage() {
  const navigate = useNavigate();

  useSeoMeta({
    title: "About JedMee — Pharmacy Management Software for Medicine Shops Worldwide",
    description:
      "Learn about JedMee — trusted pharmacy management software for medicine shops, chemists, and pharmaceutical distributors worldwide. Tax-compliant billing, inventory management, and cloud-based operations for pharmacies globally.",
    keywords:
      "about JedMee, pharmacy software company, medicine shop management software, pharmacy management platform, chemist software, pharmaceutical software company, pharmacy billing software",
    canonical: "https://jedmee.com/about",
  });

  const stats = [
    { num: 500, suffix: "+", label: "Pharmacies Onboarded", sc: "#6b3fa0" },
    { num: 15,  suffix: "+", label: "Countries Supported",  sc: "#0ea5e9" },
    { num: 2,   suffix: "M+", label: "Invoices Processed",  sc: "#16a34a" },
    { num: 99,  suffix: ".9%", label: "Uptime SLA",          sc: "#d97706" },
  ];

  const values = [
    {
      icon: <Icon name="globe" size={24} />,
      title: "Pharmacy-First Design",
      desc: "Every feature is built around real pharmacy workflows — tax invoicing, compliance support, multi-currency billing, and easy stock management.",
      vc: "#0ea5e9",
    },
    {
      icon: <Icon name="lock" size={24} />,
      title: "Security & Privacy",
      desc: "Your business data is encrypted at rest and in transit. We never sell your data. Role-based access ensures only the right people see the right information.",
      vc: "#6b3fa0",
    },
    {
      icon: <Icon name="zap" size={24} />,
      title: "Simplicity First",
      desc: "If a feature takes more than 3 clicks to use, we redesign it. Our goal is software that a shop owner can learn in an afternoon, not a week.",
      vc: "#d97706",
    },
    {
      icon: <Icon name="heart" size={24} />,
      title: "Customer Success",
      desc: "We succeed only when you succeed. Our support team is available in English and we offer free onboarding help for every new account — at no extra charge.",
      vc: "#16a34a",
    },
  ];

  const trustItems = [
    "Tax-compliant invoicing",
    "Cloud-based & mobile-friendly",
    "No credit card required to start",
    "Free onboarding support",
  ];

  return (
    <LandingLayout>
      {/* ── HERO ── */}
      <section className="ip-hero">
        <div className="ip-hero-bg">
          <div className="ip-hero-orb ip-hero-orb--1" />
          <div className="ip-hero-orb ip-hero-orb--2" />
          <div className="ip-hero-orb ip-hero-orb--3" />
          <div className="ip-hero-grid" />
        </div>
        <div className="ln-container">
          <div className="ip-hero-inner">
            <span className="ln-section-label">Our Story</span>
            <h1 className="ip-hero-title">
              Built for the{" "}
              <span className="ip-hero-title-accent">Global Pharmacy Ecosystem</span>
            </h1>
            <p className="ip-hero-sub">
              JedMee was founded with one goal: make running a medicine shop or pharmaceutical distribution business as simple as possible — without expensive consultants, complex ERP systems, or hours of training.
            </p>
            <div className="ip-hero-ctas">
              <button className="ln-btn ln-btn--primary ln-btn--lg" onClick={() => navigate("/register")}>
                Start Free Today <Icon name="arrow" size={16} />
              </button>
              <button className="ln-btn ln-btn--ghost ln-btn--lg" onClick={() => navigate("/contact")}>
                Talk to Us
              </button>
            </div>
            {/* Trust row */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", justifyContent: "center", marginTop: "32px" }}>
              {trustItems.map(t => (
                <span key={t} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-text-3)" }}>
                  <Icon name="check" size={14} /> {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── MISSION ── */}
      <section className="ip-section--alt">
        <div className="ln-container">
          <div className="ip-mission-layout">
            <div className="ip-mission-text">
              <span className="ln-section-label">Our Mission</span>
              <h2 className="ln-section-title" style={{ textAlign: "left", marginBottom: 0 }}>
                Empowering Every Pharmacy, Big or Small
              </h2>
              <p>
                There are millions of registered pharmacies and thousands of pharmaceutical distributors worldwide. Most of them still rely on paper registers, disconnected spreadsheets, or outdated desktop software that hasn't been updated in years.
              </p>
              <p>
                JedMee changes that. We bring cloud-based, tax-compliant, mobile-friendly pharmacy management to every pharmacy — from a single-counter medicine shop to a large multi-branch distributor.
              </p>
            </div>
            <div className="ip-stats-grid">
              {stats.map(s => (
                <div key={s.label} className="ip-stat-card" style={{ "--sc": s.sc }}>
                  <div className="ip-stat-num">
                    <Counter end={s.num} suffix={s.suffix} />
                  </div>
                  <div className="ip-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── VALUES ── */}
      <section className="ip-section">
        <div className="ln-container">
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <span className="ln-section-label">What We Stand For</span>
            <h2 className="ln-section-title">Our Core Values</h2>
            <p className="ln-section-sub" style={{ margin: "0 auto" }}>
              Everything we build is guided by these principles.
            </p>
          </div>
          <div className="ip-values-grid">
            {values.map(v => (
              <div key={v.title} className="ip-value-card" style={{ "--vc": v.vc }}>
                <div className="ip-value-icon">{v.icon}</div>
                <div className="ip-value-title">{v.title}</div>
                <p className="ip-value-desc">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TEAM ── */}
      <section className="ip-section--alt">
        <div className="ln-container">
          <div style={{ textAlign: "center", marginBottom: "36px" }}>
            <span className="ln-section-label">The Team</span>
            <h2 className="ln-section-title">Built by Pharmacy & Technology Experts</h2>
          </div>
          <div className="ip-team-card">
            <div style={{ display: "flex", justifyContent: "center", gap: "0", marginBottom: "24px" }}>
              {["AK","VR","SM","PR"].map((initials, i) => (
                <div key={initials} style={{
                  width: 52, height: 52, borderRadius: "50%",
                  background: `linear-gradient(135deg, hsl(${260 + i * 20},60%,50%) 0%, hsl(${280 + i * 20},70%,60%) 100%)`,
                  color: "#fff", fontSize: 14, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "3px solid var(--color-card)",
                  marginLeft: i === 0 ? 0 : -14,
                  boxShadow: "var(--shadow-sm)",
                }}>
                  {initials}
                </div>
              ))}
            </div>
            <p style={{ color: "var(--color-text-muted)", lineHeight: 1.85, fontSize: "var(--text-sm)" }}>
              Our founding team has direct experience working with pharmaceutical distributors and retail pharmacies across multiple countries. We've seen the pain points firsthand — and we've built JedMee to solve them.
            </p>
            <p style={{ color: "var(--color-text-muted)", lineHeight: 1.85, fontSize: "var(--text-sm)", marginTop: 14 }}>
              We're a lean, focused team of engineers, designers, and pharma domain experts. We don't have a fancy office — we have a product that works, customers who trust us, and a mission that drives us every day.
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="ip-cta">
        <div className="ln-container">
          <div className="ip-cta-inner">
            <h2 className="ip-cta-title">Ready to Modernise Your Pharmacy?</h2>
            <p className="ip-cta-sub">
              Join thousands of pharmacies and distributors worldwide already using JedMee. Start free — no credit card required.
            </p>
            <div className="ip-cta-btns">
              <button className="ln-btn ln-btn--white ln-btn--lg" onClick={() => navigate("/register")}>
                Get Started Free <Icon name="arrow" size={16} />
              </button>
              <button className="ln-btn ln-btn--outline-white ln-btn--lg" onClick={() => navigate("/contact")}>
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}