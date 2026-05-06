import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import LandingLayout from "../components/LandingLayout.jsx";
import { useSeoMeta } from "../utils/seo.js";
import "./LandingPage.css";
import "./InnerPages.css";

function Icon({ name, size = 20 }) {
  const p = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round",
    strokeLinejoin: "round", className: "ln-icon",
  };
  const icons = {
    arrow:   <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    file:    <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    mail:    <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
  };
  return <svg {...p}>{icons[name] || null}</svg>;
}

const SECTIONS = [
  {
    num: "01",
    title: "Acceptance of Terms",
    content: `By accessing or using JedMee ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the Service. These Terms apply to all users, including pharmacy owners, distributors, staff members, and any other individuals who access the platform.`,
  },
  {
    num: "02",
    title: "Description of Service",
    content: `JedMee provides cloud-based pharmacy management software designed for Indian medicine shops and pharmaceutical distributors. The Service includes inventory management, GST billing, purchase and sales invoicing, customer and vendor ledgers, prescription management, and related features. We reserve the right to modify, suspend, or discontinue any part of the Service at any time with reasonable notice.`,
  },
  {
    num: "03",
    title: "Account Registration",
    content: `To use JedMee, you must create an account by providing accurate and complete information. You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account. You must notify us immediately at support@jedmee.com if you suspect any unauthorised access to your account. Each account is for a single business entity; sharing accounts across unrelated businesses is not permitted.`,
  },
  {
    num: "04",
    title: "Subscription Plans and Billing",
    content: `JedMee offers multiple subscription tiers including a free Starter plan and paid plans (Growth, Professional, Enterprise). Paid plans are billed monthly or annually as selected at the time of subscription. All prices are in Indian Rupees (INR) and are inclusive of applicable taxes unless stated otherwise. Subscriptions auto-renew unless cancelled before the renewal date. Refunds are provided at our discretion for annual plans cancelled within 7 days of payment.`,
  },
  {
    num: "05",
    title: "Acceptable Use",
    content: `You agree to use JedMee only for lawful purposes and in accordance with these Terms. You must not: (a) use the Service to store or transmit unlawful, fraudulent, or harmful content; (b) attempt to gain unauthorised access to any part of the Service or its infrastructure; (c) reverse-engineer, decompile, or disassemble any part of the software; (d) use the Service to violate any applicable law, including the Drugs and Cosmetics Act, 1940, or GST regulations; (e) resell or sublicense access to the Service without written permission.`,
  },
  {
    num: "06",
    title: "Data Ownership and Privacy",
    content: `You retain full ownership of all business data you enter into JedMee, including customer records, invoices, inventory data, and financial information. JedMee does not sell your data to third parties. We process your data solely to provide and improve the Service. Please refer to our Privacy Policy for full details on how we collect, store, and protect your data. Upon account termination, you may request a data export within 30 days.`,
  },
  {
    num: "07",
    title: "GST Compliance",
    content: `JedMee generates GST-compliant invoices based on the information you provide. It is your responsibility to ensure that your GSTIN, HSN/SAC codes, tax rates, and other GST-related details are accurate. JedMee is not a GST filing service and does not file returns on your behalf. We recommend consulting a qualified CA or tax professional for GST compliance advice.`,
  },
  {
    num: "08",
    title: "Intellectual Property",
    content: `All software, designs, logos, trademarks, and content on the JedMee platform are the intellectual property of JedMee and its licensors. You are granted a limited, non-exclusive, non-transferable licence to use the Service for your internal business purposes. You may not copy, reproduce, or create derivative works from any part of the Service without our prior written consent.`,
  },
  {
    num: "09",
    title: "Limitation of Liability",
    content: `To the maximum extent permitted by applicable law, JedMee shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities, arising from your use of or inability to use the Service. Our total liability to you for any claim arising from these Terms shall not exceed the amount you paid to JedMee in the 3 months preceding the claim.`,
  },
  {
    num: "10",
    title: "Service Availability",
    content: `We strive to maintain 99.9% uptime for the JedMee platform. However, we do not guarantee uninterrupted access and are not liable for downtime caused by maintenance, third-party service failures, internet outages, or events beyond our reasonable control. Planned maintenance will be communicated in advance where possible.`,
  },
  {
    num: "11",
    title: "Termination",
    content: `Either party may terminate the account at any time. You may cancel your subscription from within the platform settings. We reserve the right to suspend or terminate accounts that violate these Terms, engage in fraudulent activity, or fail to pay subscription fees after reasonable notice. Upon termination, your access to the Service will cease, but your data will be retained for 30 days to allow for export.`,
  },
  {
    num: "12",
    title: "Governing Law and Disputes",
    content: `These Terms are governed by the laws of India. Any disputes arising from these Terms or your use of the Service shall be subject to the exclusive jurisdiction of the courts in Ahmedabad, Gujarat, India. We encourage you to contact us first at legal@jedmee.com to resolve any disputes amicably before initiating legal proceedings.`,
  },
  {
    num: "13",
    title: "Changes to Terms",
    content: `We may update these Terms from time to time. We will notify you of material changes via email or an in-app notification at least 14 days before the changes take effect. Your continued use of the Service after the effective date constitutes acceptance of the updated Terms. If you do not agree to the changes, you may terminate your account before the effective date.`,
  },
  {
    num: "14",
    title: "Contact",
    content: `For questions about these Terms, please contact us at supportjedmee@gmail.com and we'll be happy to help.`,
  },
];

export default function TermsPage() {
  const navigate = useNavigate();
  const [active, setActive] = useState(null);

  useSeoMeta({
    title: "Terms of Service — JedMee Pharmacy Management Software India",
    description:
      "Read JedMee's Terms of Service for our pharmacy management platform. Understand your rights and responsibilities when using our medicine shop software, GST billing system, and inventory management tools in India.",
    keywords:
      "JedMee terms of service, pharmacy software terms, medicine shop software terms, pharmacy management platform terms India",
    canonical: "https://jedmee.com/terms",
  });

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  };

  return (
    <LandingLayout>
      {/* ── HERO ── */}
      <section className="ip-hero">
        <div className="ip-hero-bg">
          <div className="ip-hero-orb ip-hero-orb--1" />
          <div className="ip-hero-orb ip-hero-orb--2" />
          <div className="ip-hero-grid" />
        </div>
        <div className="ln-container">
          <div className="ip-hero-inner">
            <span className="ln-section-label">Legal</span>
            <h1 className="ip-hero-title">
              Terms of <span className="ip-hero-title-accent">Service</span>
            </h1>
            <p className="ip-hero-sub">
              Last updated: 7 May 2026. Please read these terms carefully before using JedMee.
            </p>
            {/* Meta badges */}
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              {[
                { icon: <Icon name="file" size={14} />, label: "14 Sections" },
                { icon: <Icon name="mail" size={14} />, label: "legal@jedmee.com" },
              ].map(b => (
                <span key={b.label} className="ln-section-label" style={{ margin: 0 }}>
                  {b.icon} {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTENT ── */}
      <section className="ip-section--alt">
        <div className="ln-container">
          <div className="ip-terms-layout">
            {/* Sidebar TOC */}
            <aside className="ip-terms-toc">
              <div className="ip-terms-toc-title">Contents</div>
              <nav className="ip-terms-toc-list">
                {SECTIONS.map(s => (
                  <a
                    key={s.num}
                    className="ip-terms-toc-link"
                    href={`#section-${s.num}`}
                    onClick={e => { e.preventDefault(); scrollTo(`section-${s.num}`); }}
                    style={active === `section-${s.num}` ? { background: "var(--color-surface-2)", color: "var(--color-primary)" } : {}}
                  >
                    <span style={{ color: "var(--color-text-faint)", marginRight: 6 }}>{s.num}.</span>
                    {s.title}
                  </a>
                ))}
              </nav>
            </aside>

            {/* Main content */}
            <div className="ip-terms-content">
              <p className="ip-terms-intro">
                These Terms of Service ("Terms") govern your access to and use of the JedMee platform and services. By creating an account or using JedMee, you agree to these Terms. If you are using JedMee on behalf of a business, you represent that you have the authority to bind that business to these Terms.
              </p>

              {SECTIONS.map(s => (
                <div key={s.num} id={`section-${s.num}`} className="ip-terms-section">
                  <div className="ip-terms-section-header">
                    <div className="ip-terms-section-num">{s.num}</div>
                    <h2 className="ip-terms-section-title">{s.title}</h2>
                  </div>
                  <p className="ip-terms-section-body">{s.content}</p>
                </div>
              ))}

            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="ip-cta">
        <div className="ln-container">
          <div className="ip-cta-inner">
            <h2 className="ip-cta-title">Ready to Get Started?</h2>
            <p className="ip-cta-sub">
              Join 500+ pharmacies already using JedMee. Start free — no credit card required.
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