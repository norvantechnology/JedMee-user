import React from "react";
import { useNavigate } from "react-router-dom";
import LandingLayout from "../components/LandingLayout.jsx";
import { useSeoMeta } from "../utils/seo.js";
import "./LandingPage.css";

export default function TermsPage() {
  const navigate = useNavigate();

  useSeoMeta({
    title: "Terms of Service — JedMee Pharmacy Management Software",
    description:
      "Read JedMee's Terms of Service. Understand your rights and responsibilities when using our pharmacy management platform for medicine shops and distributors in India.",
  });

  const sections = [
    {
      title: "1. Acceptance of Terms",
      content: `By accessing or using JedMee ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the Service. These Terms apply to all users, including pharmacy owners, distributors, staff members, and any other individuals who access the platform.`,
    },
    {
      title: "2. Description of Service",
      content: `JedMee provides cloud-based pharmacy management software designed for Indian medicine shops and pharmaceutical distributors. The Service includes inventory management, GST billing, purchase and sales invoicing, customer and vendor ledgers, prescription management, and related features. We reserve the right to modify, suspend, or discontinue any part of the Service at any time with reasonable notice.`,
    },
    {
      title: "3. Account Registration",
      content: `To use JedMee, you must create an account by providing accurate and complete information. You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account. You must notify us immediately at support@jedmee.com if you suspect any unauthorised access to your account. Each account is for a single business entity; sharing accounts across unrelated businesses is not permitted.`,
    },
    {
      title: "4. Subscription Plans and Billing",
      content: `JedMee offers multiple subscription tiers including a free Starter plan and paid plans (Growth, Professional, Enterprise). Paid plans are billed monthly or annually as selected at the time of subscription. All prices are in Indian Rupees (INR) and are inclusive of applicable taxes unless stated otherwise. Subscriptions auto-renew unless cancelled before the renewal date. Refunds are provided at our discretion for annual plans cancelled within 7 days of payment.`,
    },
    {
      title: "5. Acceptable Use",
      content: `You agree to use JedMee only for lawful purposes and in accordance with these Terms. You must not: (a) use the Service to store or transmit unlawful, fraudulent, or harmful content; (b) attempt to gain unauthorised access to any part of the Service or its infrastructure; (c) reverse-engineer, decompile, or disassemble any part of the software; (d) use the Service to violate any applicable law, including the Drugs and Cosmetics Act, 1940, or GST regulations; (e) resell or sublicense access to the Service without written permission.`,
    },
    {
      title: "6. Data Ownership and Privacy",
      content: `You retain full ownership of all business data you enter into JedMee, including customer records, invoices, inventory data, and financial information. JedMee does not sell your data to third parties. We process your data solely to provide and improve the Service. Please refer to our Privacy Policy for full details on how we collect, store, and protect your data. Upon account termination, you may request a data export within 30 days.`,
    },
    {
      title: "7. GST Compliance",
      content: `JedMee generates GST-compliant invoices based on the information you provide. It is your responsibility to ensure that your GSTIN, HSN/SAC codes, tax rates, and other GST-related details are accurate. JedMee is not a GST filing service and does not file returns on your behalf. We recommend consulting a qualified CA or tax professional for GST compliance advice.`,
    },
    {
      title: "8. Intellectual Property",
      content: `All software, designs, logos, trademarks, and content on the JedMee platform are the intellectual property of JedMee and its licensors. You are granted a limited, non-exclusive, non-transferable licence to use the Service for your internal business purposes. You may not copy, reproduce, or create derivative works from any part of the Service without our prior written consent.`,
    },
    {
      title: "9. Limitation of Liability",
      content: `To the maximum extent permitted by applicable law, JedMee shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities, arising from your use of or inability to use the Service. Our total liability to you for any claim arising from these Terms shall not exceed the amount you paid to JedMee in the 3 months preceding the claim.`,
    },
    {
      title: "10. Service Availability",
      content: `We strive to maintain 99.9% uptime for the JedMee platform. However, we do not guarantee uninterrupted access and are not liable for downtime caused by maintenance, third-party service failures, internet outages, or events beyond our reasonable control. Planned maintenance will be communicated in advance where possible.`,
    },
    {
      title: "11. Termination",
      content: `Either party may terminate the account at any time. You may cancel your subscription from within the platform settings. We reserve the right to suspend or terminate accounts that violate these Terms, engage in fraudulent activity, or fail to pay subscription fees after reasonable notice. Upon termination, your access to the Service will cease, but your data will be retained for 30 days to allow for export.`,
    },
    {
      title: "12. Governing Law and Disputes",
      content: `These Terms are governed by the laws of India. Any disputes arising from these Terms or your use of the Service shall be subject to the exclusive jurisdiction of the courts in Ahmedabad, Gujarat, India. We encourage you to contact us first at legal@jedmee.com to resolve any disputes amicably before initiating legal proceedings.`,
    },
    {
      title: "13. Changes to Terms",
      content: `We may update these Terms from time to time. We will notify you of material changes via email or an in-app notification at least 14 days before the changes take effect. Your continued use of the Service after the effective date constitutes acceptance of the updated Terms. If you do not agree to the changes, you may terminate your account before the effective date.`,
    },
    {
      title: "14. Contact",
      content: `For questions about these Terms, please contact us at legal@jedmee.com or write to: JedMee, Ahmedabad, Gujarat, India.`,
    },
  ];

  return (
    <LandingLayout>
      {/* ── HERO ── */}
      <section className="ln-section" style={{ background: "var(--ln-bg-alt)", paddingTop: "80px" }}>
        <div className="ln-container" style={{ textAlign: "center", maxWidth: "720px" }}>
          <span className="ln-section-label">Legal</span>
          <h1 className="ln-section-title" style={{ fontSize: "clamp(1.8rem,4.5vw,2.8rem)" }}>
            Terms of Service
          </h1>
          <p className="ln-section-sub">
            Last updated: 7 May 2026. Please read these terms carefully before using JedMee.
          </p>
        </div>
      </section>

      {/* ── CONTENT ── */}
      <section className="ln-section">
        <div className="ln-container" style={{ maxWidth: "800px" }}>
          <div style={{
            background: "var(--ln-card-bg)",
            border: "1px solid var(--ln-border)",
            borderRadius: "16px",
            padding: "clamp(24px,5vw,56px)",
          }}>
            <p style={{ color: "var(--ln-text-muted)", lineHeight: 1.8, marginBottom: "40px", fontSize: "0.97rem" }}>
              These Terms of Service ("Terms") govern your access to and use of the JedMee platform and services. By creating an account or using JedMee, you agree to these Terms. If you are using JedMee on behalf of a business, you represent that you have the authority to bind that business to these Terms.
            </p>

            {sections.map((s, i) => (
              <div key={i} style={{ marginBottom: "36px" }}>
                <h2 style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "var(--ln-text)",
                  marginBottom: "12px",
                  paddingBottom: "8px",
                  borderBottom: "1px solid var(--ln-border)",
                }}>
                  {s.title}
                </h2>
                <p style={{ color: "var(--ln-text-muted)", lineHeight: 1.8, fontSize: "0.95rem" }}>
                  {s.content}
                </p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ textAlign: "center", marginTop: "48px" }}>
            <p style={{ color: "var(--ln-text-muted)", marginBottom: "20px" }}>
              Have questions about our terms? We're happy to help.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button className="ln-btn ln-btn--primary" onClick={() => navigate("/contact")}>
                Contact Us
              </button>
              <button className="ln-btn ln-btn--ghost" onClick={() => navigate("/")}>
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}