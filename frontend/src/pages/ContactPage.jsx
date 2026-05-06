import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import LandingLayout from "../components/LandingLayout.jsx";
import { useSeoMeta } from "../utils/seo.js";
import "./LandingPage.css";

export default function ContactPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error

  useSeoMeta({
    title: "Contact JedMee — Pharmacy Management Software Support",
    description:
      "Get in touch with the JedMee team. We help Indian pharmacies and distributors with onboarding, billing questions, technical support, and sales enquiries.",
  });

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return;
    setStatus("sending");
    // Simulate submission — replace with real API call when backend endpoint is ready
    await new Promise(r => setTimeout(r, 1200));
    setStatus("sent");
  };

  const contacts = [
    {
      icon: "📧",
      title: "Email Support",
      detail: "support@jedmee.com",
      sub: "We reply within 24 hours on business days",
      href: "mailto:support@jedmee.com",
    },
    {
      icon: "💼",
      title: "Sales Enquiries",
      detail: "sales@jedmee.com",
      sub: "For Enterprise plans and custom pricing",
      href: "mailto:sales@jedmee.com",
    },
    {
      icon: "📍",
      title: "Headquarters",
      detail: "Ahmedabad, Gujarat, India",
      sub: "Serving pharmacies across all of India",
      href: null,
    },
  ];

  return (
    <LandingLayout>
      {/* ── HERO ── */}
      <section className="ln-section" style={{ background: "var(--ln-bg-alt)", paddingTop: "80px" }}>
        <div className="ln-container" style={{ textAlign: "center", maxWidth: "680px" }}>
          <span className="ln-section-label">Get in Touch</span>
          <h1 className="ln-section-title" style={{ fontSize: "clamp(1.8rem,4.5vw,2.8rem)" }}>
            We're Here to Help
          </h1>
          <p className="ln-section-sub">
            Whether you have a question about features, pricing, onboarding, or anything else — our team is ready to answer.
          </p>
        </div>
      </section>

      {/* ── CONTACT CARDS ── */}
      <section className="ln-section">
        <div className="ln-container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "24px", marginBottom: "64px" }}>
            {contacts.map(c => (
              <div key={c.title} className="ln-feat" style={{ padding: "32px 24px", textAlign: "center" }}>
                <div style={{ fontSize: "2.2rem", marginBottom: "14px" }}>{c.icon}</div>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--ln-text)", marginBottom: "8px" }}>{c.title}</h3>
                {c.href ? (
                  <a href={c.href} style={{ color: "var(--ln-accent)", fontWeight: 600, fontSize: "0.95rem", textDecoration: "none" }}>
                    {c.detail}
                  </a>
                ) : (
                  <span style={{ color: "var(--ln-accent)", fontWeight: 600, fontSize: "0.95rem" }}>{c.detail}</span>
                )}
                <p style={{ color: "var(--ln-text-muted)", fontSize: "0.85rem", marginTop: "6px", lineHeight: 1.5 }}>{c.sub}</p>
              </div>
            ))}
          </div>

          {/* ── FORM ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "48px", alignItems: "start" }}>
            {/* Left: info */}
            <div>
              <h2 className="ln-section-title" style={{ fontSize: "clamp(1.4rem,3vw,2rem)", textAlign: "left", marginBottom: "16px" }}>
                Send Us a Message
              </h2>
              <p style={{ color: "var(--ln-text-muted)", lineHeight: 1.8, marginBottom: "24px" }}>
                Fill in the form and we'll get back to you within one business day. For urgent issues, email us directly at <a href="mailto:support@jedmee.com" style={{ color: "var(--ln-accent)" }}>support@jedmee.com</a>.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {[
                  { emoji: "⏱️", text: "Response within 24 hours on business days" },
                  { emoji: "🇮🇳", text: "Support in Hindi and English" },
                  { emoji: "🆓", text: "Free onboarding help for all new accounts" },
                  { emoji: "📞", text: "Phone support available for Professional & Enterprise plans" },
                ].map(item => (
                  <div key={item.text} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "1.2rem", flexShrink: 0 }}>{item.emoji}</span>
                    <span style={{ color: "var(--ln-text-muted)", fontSize: "0.93rem", lineHeight: 1.6 }}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: form */}
            <div style={{
              background: "var(--ln-card-bg)",
              border: "1px solid var(--ln-border)",
              borderRadius: "16px",
              padding: "clamp(24px,4vw,40px)",
            }}>
              {status === "sent" ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: "3rem", marginBottom: "16px" }}>✅</div>
                  <h3 style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--ln-text)", marginBottom: "10px" }}>
                    Message Sent!
                  </h3>
                  <p style={{ color: "var(--ln-text-muted)", lineHeight: 1.7 }}>
                    Thanks for reaching out. We'll get back to you within one business day.
                  </p>
                  <button
                    className="ln-btn ln-btn--ghost"
                    style={{ marginTop: "24px" }}
                    onClick={() => { setStatus("idle"); setForm({ name: "", email: "", phone: "", subject: "", message: "" }); }}
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                    <div>
                      <label style={labelStyle}>Full Name *</label>
                      <input
                        name="name" value={form.name} onChange={handleChange}
                        placeholder="Amit Sharma" required
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Email Address *</label>
                      <input
                        name="email" type="email" value={form.email} onChange={handleChange}
                        placeholder="amit@pharmacy.com" required
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                    <div>
                      <label style={labelStyle}>Phone (optional)</label>
                      <input
                        name="phone" value={form.phone} onChange={handleChange}
                        placeholder="+91 98765 43210"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Subject</label>
                      <select name="subject" value={form.subject} onChange={handleChange} style={inputStyle}>
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
                  <div style={{ marginBottom: "24px" }}>
                    <label style={labelStyle}>Message *</label>
                    <textarea
                      name="message" value={form.message} onChange={handleChange}
                      placeholder="Tell us how we can help you..."
                      required rows={5}
                      style={{ ...inputStyle, resize: "vertical", minHeight: "120px" }}
                    />
                  </div>
                  <button
                    type="submit"
                    className="ln-btn ln-btn--primary"
                    style={{ width: "100%", justifyContent: "center", fontSize: "1rem", padding: "14px" }}
                    disabled={status === "sending"}
                  >
                    {status === "sending" ? "Sending…" : "Send Message"}
                  </button>
                  <p style={{ color: "var(--ln-text-muted)", fontSize: "0.8rem", textAlign: "center", marginTop: "12px" }}>
                    We respect your privacy. Your information is never shared with third parties.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="ln-section" style={{ background: "var(--ln-bg-alt)" }}>
        <div className="ln-container" style={{ maxWidth: "720px" }}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <span className="ln-section-label">FAQ</span>
            <h2 className="ln-section-title">Common Questions</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {[
              {
                q: "How long does onboarding take?",
                a: "Most pharmacies are fully set up within a single afternoon. Our onboarding team will guide you through importing your inventory, setting up GST details, and training your staff.",
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
                q: "Is JedMee compliant with Indian GST regulations?",
                a: "Yes. JedMee generates GST-compliant invoices with GSTIN, HSN codes, CGST/SGST/IGST breakdowns, and e-invoice support. We stay updated with GST rule changes.",
              },
            ].map((item, i) => (
              <div key={i} style={{
                background: "var(--ln-card-bg)",
                border: "1px solid var(--ln-border)",
                borderRadius: "12px",
                padding: "24px 28px",
              }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--ln-text)", marginBottom: "10px" }}>{item.q}</h3>
                <p style={{ color: "var(--ln-text-muted)", lineHeight: 1.7, fontSize: "0.93rem" }}>{item.a}</p>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: "40px" }}>
            <p style={{ color: "var(--ln-text-muted)", marginBottom: "16px" }}>Still have questions?</p>
            <button className="ln-btn ln-btn--primary" onClick={() => navigate("/register")}>
              Start Free — No Credit Card
            </button>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}

const labelStyle = {
  display: "block",
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "var(--ln-text-muted)",
  marginBottom: "6px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  background: "var(--ln-bg)",
  border: "1px solid var(--ln-border)",
  borderRadius: "8px",
  color: "var(--ln-text)",
  fontSize: "0.95rem",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  transition: "border-color 0.2s",
};