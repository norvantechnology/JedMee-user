import React from "react";
import { useNavigate } from "react-router-dom";
import LandingLayout from "../components/LandingLayout.jsx";
import { useSeoMeta } from "../utils/seo.js";
import "./LandingPage.css";

export default function AboutPage() {
  const navigate = useNavigate();

  useSeoMeta({
    title: "About JedMee — Pharmacy Management Software for India",
    description:
      "JedMee is built for Indian medicine shops and distributors. Learn our story, mission, and why 500+ pharmacies across India trust us for GST billing, stock management, and more.",
  });

  return (
    <LandingLayout>
      {/* ── HERO ── */}
      <section className="ln-section" style={{ background: "var(--ln-bg-alt)", paddingTop: "80px" }}>
        <div className="ln-container" style={{ textAlign: "center", maxWidth: "760px" }}>
          <span className="ln-section-label">Our Story</span>
          <h1 className="ln-section-title" style={{ fontSize: "clamp(2rem,5vw,3rem)" }}>
            Built for India's Pharmacy Ecosystem
          </h1>
          <p className="ln-section-sub">
            JedMee was founded with one goal: make running a medicine shop or pharmaceutical distribution business as simple as possible — without expensive consultants, complex ERP systems, or hours of training.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: "32px" }}>
            <button className="ln-btn ln-btn--primary" onClick={() => navigate("/register")}>
              Start Free Today
            </button>
            <button className="ln-btn ln-btn--ghost" onClick={() => navigate("/contact")}>
              Talk to Us
            </button>
          </div>
        </div>
      </section>

      {/* ── MISSION ── */}
      <section className="ln-section">
        <div className="ln-container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "40px", alignItems: "center" }}>
            <div>
              <span className="ln-section-label">Our Mission</span>
              <h2 className="ln-section-title" style={{ fontSize: "clamp(1.6rem,4vw,2.4rem)", textAlign: "left" }}>
                Empowering Every Pharmacy, Big or Small
              </h2>
              <p style={{ color: "var(--ln-text-muted)", lineHeight: 1.8, marginTop: "16px" }}>
                India has over 8 lakh registered pharmacies and thousands of pharmaceutical distributors. Most of them still rely on paper registers, disconnected spreadsheets, or outdated desktop software that hasn't been updated in years.
              </p>
              <p style={{ color: "var(--ln-text-muted)", lineHeight: 1.8, marginTop: "12px" }}>
                JedMee changes that. We bring cloud-based, GST-compliant, mobile-friendly pharmacy management to every corner of India — from a single-counter medical shop in Jaipur to a multi-branch distributor in Mumbai.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              {[
                { num: "500+", label: "Pharmacies Onboarded" },
                { num: "12+", label: "States Covered" },
                { num: "₹50Cr+", label: "Invoices Processed" },
                { num: "99.9%", label: "Uptime SLA" },
              ].map(s => (
                <div key={s.label} className="ln-stat" style={{ textAlign: "center", padding: "28px 20px" }}>
                  <div className="ln-stat-num">{s.num}</div>
                  <div className="ln-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── VALUES ── */}
      <section className="ln-section" style={{ background: "var(--ln-bg-alt)" }}>
        <div className="ln-container">
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <span className="ln-section-label">What We Stand For</span>
            <h2 className="ln-section-title">Our Core Values</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "28px" }}>
            {[
              {
                icon: "🇮🇳",
                title: "India-First Design",
                desc: "Every feature is built around Indian pharmacy workflows — GST invoicing, GSTIN validation, Hindi-friendly UI, and support for Indian payment methods.",
              },
              {
                icon: "🔒",
                title: "Security & Privacy",
                desc: "Your business data is encrypted at rest and in transit. We never sell your data. Role-based access ensures only the right people see the right information.",
              },
              {
                icon: "⚡",
                title: "Simplicity First",
                desc: "If a feature takes more than 3 clicks to use, we redesign it. Our goal is software that a shop owner can learn in an afternoon, not a week.",
              },
              {
                icon: "🤝",
                title: "Customer Success",
                desc: "We succeed only when you succeed. Our support team speaks Hindi and English, and we offer onboarding help for every new account — free of charge.",
              },
            ].map(v => (
              <div key={v.title} className="ln-feat" style={{ padding: "32px 28px" }}>
                <div style={{ fontSize: "2.4rem", marginBottom: "16px" }}>{v.icon}</div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ln-text)", marginBottom: "10px" }}>{v.title}</h3>
                <p style={{ color: "var(--ln-text-muted)", lineHeight: 1.7, fontSize: "0.95rem" }}>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TEAM ── */}
      <section className="ln-section">
        <div className="ln-container" style={{ textAlign: "center", maxWidth: "680px" }}>
          <span className="ln-section-label">The Team</span>
          <h2 className="ln-section-title">Built by Pharmacy Industry Insiders</h2>
          <p className="ln-section-sub">
            Our founding team has direct experience working with pharmaceutical distributors and retail pharmacies across Gujarat, Maharashtra, and Rajasthan. We've seen the pain points firsthand — and we've built JedMee to solve them.
          </p>
          <p style={{ color: "var(--ln-text-muted)", lineHeight: 1.8, marginTop: "16px" }}>
            We're a lean, focused team of engineers, designers, and pharma domain experts. We don't have a fancy office — we have a product that works, customers who trust us, and a mission that drives us every day.
          </p>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="ln-section" style={{ background: "var(--ln-bg-alt)" }}>
        <div className="ln-container" style={{ textAlign: "center", maxWidth: "600px" }}>
          <h2 className="ln-section-title">Ready to Modernise Your Pharmacy?</h2>
          <p className="ln-section-sub">
            Join 500+ pharmacies and distributors already using JedMee. Start free — no credit card required.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: "32px" }}>
            <button className="ln-btn ln-btn--primary" style={{ fontSize: "1rem", padding: "14px 32px" }} onClick={() => navigate("/register")}>
              Get Started Free
            </button>
            <button className="ln-btn ln-btn--ghost" onClick={() => navigate("/contact")}>
              Contact Sales
            </button>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}