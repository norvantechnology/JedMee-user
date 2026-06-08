import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import LandingLayout from "../components/LandingLayout.jsx";
import { useSeoMeta, useJsonLd } from "../utils/seo.js";
import "./LandingPage.css";
import "./InnerPages.css";

/* ── SVG Icon ── */
function Icon({ name, size = 20 }) {
  const p = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round",
    strokeLinejoin: "round", className: "ln-icon",
  };
  const icons = {
    arrow:   <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    mail:    <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    briefcase:<><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    mapPin:  <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
    clock:   <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    globe:   <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
    phone:   <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.56 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></>,
    check:   <><polyline points="20 6 9 17 4 12"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    send:    <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
  };
  return <svg {...p}>{icons[name] || null}</svg>;
}

export default function ContactPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | sent

  useSeoMeta({
    title: "Contact JedMee — Pharmacy Software Support & Sales",
    description:
      "Contact JedMee for pharmacy software support, pricing, or a free demo. We help medicine shops and distributors worldwide with billing and inventory management.",
    keywords:
      "contact JedMee, pharmacy software support, pharmacy software demo, medicine shop software help, JedMee support, pharmacy management contact, pharmacy billing demo",
    canonical: "https://jedmee.com/contact",
  });

  useJsonLd([
    {
      "@context": "https://schema.org",
      "@type": "ContactPage",
      "name": "Contact JedMee — Pharmacy Software Support & Sales",
      "url": "https://jedmee.com/contact",
      "description":
        "Contact JedMee for pharmacy software support, pricing, or a free demo.",
      "inLanguage": "en",
      "isPartOf": { "@type": "WebSite", "url": "https://jedmee.com" },
    },
  ]);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return;
    setStatus("sending");
    await new Promise(r => setTimeout(r, 1200));
    setStatus("sent");
  };

  const contactCards = [
    {
      icon: <Icon name="mail" size={22} />,
      title: "Email Support",
      detail: "supportjedmee@gmail.com",
      sub: "We reply within 24 hours on business days",
      href: "mailto:supportjedmee@gmail.com",
      cc: "#6b3fa0",
    },
    {
      icon: <Icon name="briefcase" size={22} />,
      title: "Sales & Onboarding",
      detail: "supportjedmee@gmail.com",
      sub: "For Enterprise plans, pricing & onboarding help",
      href: "mailto:supportjedmee@gmail.com",
      cc: "#0ea5e9",
    },
    {
      icon: <Icon name="clock" size={22} />,
      title: "Support Hours",
      detail: "Mon – Sat, 9 AM – 7 PM (UTC+5:30)",
      sub: "We're available for customers worldwide",
      href: null,
      cc: "#16a34a",
    },
  ];

  const infoItems = [
    { icon: <Icon name="clock" size={16} />, text: "Response within 24 hours on business days" },
    { icon: <Icon name="globe" size={16} />, text: "Support in English (more languages coming soon)" },
    { icon: <Icon name="check" size={16} />, text: "Free onboarding help for all new accounts" },
    { icon: <Icon name="phone" size={16} />, text: "Phone support for Professional & Enterprise plans" },
    { icon: <Icon name="mail" size={16} />, text: "Email us anytime at supportjedmee@gmail.com" },
  ];

  const faqs = [
    {
      q: "How long does onboarding take?",
      a: "Most pharmacies are fully set up within a single afternoon. Our onboarding team will guide you through importing your inventory, setting up your tax details, and training your staff.",
    },
    {
      q: "Do you offer a free trial?",
      a: "Yes — our Starter plan is completely free with no time limit. You can upgrade to a paid plan whenever you need more features or higher limits.",
    },
    {
      q: "Can I migrate data from my existing software?",
      a: "Yes. We support data import from Excel/CSV files and can assist with migration from common pharmacy software. Contact our team for a migration consultation.",
    },
    {
      q: "Does JedMee support tax compliance in my country?",
      a: "Yes. JedMee supports GST, VAT, Sales Tax, and other tax systems. You can set the correct tax rates for your country and JedMee will generate compliant invoices automatically.",
    },
  ];

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
            <span className="ln-section-label">Get in Touch</span>
            <h1 className="ip-hero-title">
              We're Here to <span className="ip-hero-title-accent">Help</span>
            </h1>
            <p className="ip-hero-sub">
              Whether you have a question about features, pricing, onboarding, or anything else — our team is ready to answer within one business day.
            </p>
          </div>
        </div>
      </section>

      {/* ── CONTACT CARDS ── */}
      <section className="ip-section--alt">
        <div className="ln-container">
          <div className="ip-contact-grid">
            {contactCards.map(c => (
              <div key={c.title} className="ip-contact-card" style={{ "--cc": c.cc }}>
                <div className="ip-contact-icon">{c.icon}</div>
                <div className="ip-contact-title">{c.title}</div>
                {c.href ? (
                  <a href={c.href} className="ip-contact-detail">{c.detail}</a>
                ) : (
                  <span className="ip-contact-detail">{c.detail}</span>
                )}
                <p className="ip-contact-sub">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* ── FORM SECTION ── */}
          <div className="ip-form-layout">
            {/* Left: info */}
            <div>
              <h2 className="ip-form-info-title">Send Us a Message</h2>
              <p style={{ color: "var(--color-text-muted)", lineHeight: 1.8, fontSize: "var(--text-sm)" }}>
                Fill in the form and we'll get back to you within one business day. For urgent issues, email us directly at{" "}
                <a href="mailto:supportjedmee@gmail.com" style={{ color: "var(--color-primary)", fontWeight: 600 }}>supportjedmee@gmail.com</a>.
              </p>
              <div className="ip-form-info-list">
                {infoItems.map(item => (
                  <div key={item.text} className="ip-form-info-item">
                    <div className="ip-form-info-icon">{item.icon}</div>
                    <span className="ip-form-info-text">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: form */}
            <div className="ip-form-card">
              {status === "sent" ? (
                <div className="ip-form-success">
                  <span className="ip-form-success-icon">
                    <Icon name="checkCircle" size={56} />
                  </span>
                  <div className="ip-form-success-title">Message Sent!</div>
                  <p className="ip-form-success-sub">
                    Thanks for reaching out. We'll get back to you within one business day.
                  </p>
                  <button
                    className="ln-btn ln-btn--ghost"
                    onClick={() => { setStatus("idle"); setForm({ name: "", email: "", phone: "", subject: "", message: "" }); }}
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate>
                  <div className="ip-form-row">
                    <div className="ip-form-group" style={{ marginBottom: 0 }}>
                      <label className="ip-form-label">Full Name *</label>
                      <input className="ip-form-input" name="name" value={form.name} onChange={handleChange} placeholder="Amit Sharma" required />
                    </div>
                    <div className="ip-form-group" style={{ marginBottom: 0 }}>
                      <label className="ip-form-label">Email Address *</label>
                      <input className="ip-form-input" name="email" type="email" value={form.email} onChange={handleChange} placeholder="amit@pharmacy.com" required />
                    </div>
                  </div>
                  <div className="ip-form-row">
                    <div className="ip-form-group" style={{ marginBottom: 0 }}>
                      <label className="ip-form-label">Phone (optional)</label>
                      <input className="ip-form-input" name="phone" value={form.phone} onChange={handleChange} placeholder="+1 555 000 0000" />
                    </div>
                    <div className="ip-form-group" style={{ marginBottom: 0 }}>
                      <label className="ip-form-label">Subject</label>
                      <select className="ip-form-select" name="subject" value={form.subject} onChange={handleChange}>
                        <option value="">Select a topic</option>
                        <option value="general">General Enquiry</option>
                        <option value="sales">Sales / Pricing</option>
                        <option value="support">Technical Support</option>
                        <option value="billing">Billing Issue</option>
                        <option value="onboarding">Onboarding Help</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="ip-form-group">
                    <label className="ip-form-label">Message *</label>
                    <textarea className="ip-form-textarea" name="message" value={form.message} onChange={handleChange} placeholder="Tell us how we can help you..." required rows={5} />
                  </div>
                  <button type="submit" className="ln-btn ln-btn--primary ip-form-submit" disabled={status === "sending"}>
                    {status === "sending" ? "Sending…" : <><Icon name="send" size={16} /> Send Message</>}
                  </button>
                  <p className="ip-form-privacy">We respect your privacy. Your information is never shared with third parties.</p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="ip-section">
        <div className="ln-container" style={{ maxWidth: "760px" }}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <span className="ln-section-label">FAQ</span>
            <h2 className="ln-section-title">Common Questions</h2>
            <p className="ln-section-sub" style={{ margin: "0 auto" }}>
              Quick answers to the questions we hear most often.
            </p>
          </div>
          <div className="ip-faq-list">
            {faqs.map((item, i) => (
              <div key={i} className="ip-faq-item">
                <div className="ip-faq-q">{item.q}</div>
                <p className="ip-faq-a">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="ip-cta">
        <div className="ln-container">
          <div className="ip-cta-inner">
            <h2 className="ip-cta-title">Still Have Questions?</h2>
            <p className="ip-cta-sub">
              Start free and explore JedMee yourself — no credit card required. Or reach out and we'll walk you through it.
            </p>
            <div className="ip-cta-btns">
              <button className="ln-btn ln-btn--white ln-btn--lg" onClick={() => navigate("/register")}>
                Start Free <Icon name="arrow" size={16} />
              </button>
              <button className="ln-btn ln-btn--outline-white ln-btn--lg" onClick={() => navigate("/")}>
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}