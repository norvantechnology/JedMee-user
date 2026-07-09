import React from "react";
import { Link } from "react-router-dom";
import LandingLayout from "../LandingLayout.jsx";
import AuthorBio from "./AuthorBio.jsx";
import { useSeoMeta, useJsonLd } from "../../utils/seo.js";
import { buildGuidePageSchema } from "../../utils/contentSchema.js";
import "../../pages/LandingPage.css";
import "../../pages/InnerPages.css";

function GuideFaqBlock({ faqs }) {
  if (!faqs?.length) return null;
  return (
    <section className="ip-section--alt" aria-labelledby="guide-faq-heading">
      <div className="ln-container ip-prose">
        <h2 id="guide-faq-heading">Frequently Asked Questions</h2>
        <dl className="ip-faq-dl">
          {faqs.map((f) => (
            <div key={f.q} className="ip-faq-dl-item">
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function ComparisonTable({ table }) {
  if (!table?.headers?.length) return null;
  return (
    <div className="ip-table-wrap">
      <table className="ip-compare-table">
        <thead>
          <tr>
            {table.headers.map((h) => (
              <th key={h} scope="col">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HowToSteps({ howTo }) {
  if (!howTo?.steps?.length) return null;
  return (
    <section className="ip-howto" aria-labelledby="guide-howto-heading">
      <h2 id="guide-howto-heading">{howTo.heading || howTo.name || "Step-by-step guide"}</h2>
      {howTo.intro && <p>{howTo.intro}</p>}
      <ol className="ip-howto-steps">
        {howTo.steps.map((step) => (
          <li key={step.name}>
            <strong>{step.name}</strong>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function OfficialSources({ sources }) {
  if (!sources?.length) return null;
  return (
    <aside className="ip-sources" aria-label="Official references">
      <h3>Official references</h3>
      <ul>
        {sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} rel="noopener noreferrer" target="_blank">{s.label}</a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function GuideRelatedLinks({ relatedGuides }) {
  const topical = relatedGuides?.length ? relatedGuides : [];
  return (
    <nav className="ip-related" aria-label="Related resources">
      {topical.length > 0 && (
        <>
          <div className="ip-related-title">Related guides</div>
          <ul>
            {topical.map((g) => (
              <li key={g.to}><Link to={g.to}>{g.label}</Link></li>
            ))}
          </ul>
        </>
      )}
      <div className="ip-related-title" style={{ marginTop: topical.length ? 20 : 0 }}>Explore JedMee</div>
      <ul>
        <li><Link to="/">Home — pharmacy management software</Link></li>
        <li><Link to="/free-trial">Free 14-day trial</Link></li>
        <li><a href="/#pricing">Pricing plans</a></li>
        <li><Link to="/pharmacy-mobile-app">Mobile pharmacy access</Link></li>
        <li><Link to="/pharmacy-management-software">What is pharmacy management software?</Link></li>
        <li><Link to="/pharmacy-billing-guide">Pharmacy billing &amp; tax guide</Link></li>
        <li><Link to="/pharmacy-inventory-guide">Inventory management guide</Link></li>
        <li><Link to="/pharmacy-software-comparison">Software comparison</Link></li>
        <li><Link to="/wholesale-pharmacy-software">Wholesale &amp; distribution</Link></li>
        <li><Link to="/retail-wholesale-pharmacy">Retail + wholesale workflows</Link></li>
        <li><Link to="/multi-user-pharmacy-software">Multi-user roles</Link></li>
        <li><Link to="/pharmacy-financial-management">Financial management</Link></li>
        <li><Link to="/contact">Contact sales</Link></li>
      </ul>
    </nav>
  );
}

function formatDisplayDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function ContentGuidePage({
  pageTitle,
  metaTitle,
  description,
  canonical,
  label,
  introFacts,
  sections,
  faqs,
  author,
  breadcrumbs,
  datePublished,
  lastUpdated,
  relatedGuides,
  howTo,
  service,
  comparisonTable,
  officialSources,
  discoverImage,
}) {
  const crumbs = breadcrumbs || [
    { name: "Home", url: "https://jedmee.com/" },
    { name: pageTitle, url: canonical },
  ];

  useSeoMeta({
    title: metaTitle || pageTitle,
    description,
    canonical,
    ogImage: discoverImage,
  });

  useJsonLd(
    buildGuidePageSchema({
      pageTitle,
      description,
      canonical,
      breadcrumbs: crumbs,
      faqs,
      author,
      datePublished,
      dateModified: lastUpdated || datePublished,
      image: discoverImage,
      howTo,
      service,
    })
  );

  return (
    <LandingLayout>
      <section className="ip-hero">
        <div className="ip-hero-bg">
          <div className="ip-hero-orb ip-hero-orb--1" />
          <div className="ip-hero-orb ip-hero-orb--2" />
          <div className="ip-hero-grid" />
        </div>
        <div className="ln-container">
          <div className="ip-hero-inner">
            {label && <span className="ln-section-label">{label}</span>}
            <h1 className="ip-hero-title">{pageTitle}</h1>
            {lastUpdated && (
              <p className="ip-last-updated">
                Last updated: <time dateTime={lastUpdated}>{formatDisplayDate(lastUpdated)}</time>
              </p>
            )}
            {introFacts?.map((p, i) => (
              <p key={i} className={i === 0 ? "ip-lead" : "ip-hero-sub"}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      <article className="ip-section">
        <div className="ln-container ip-prose">
          {sections?.map((sec) => (
            <section key={sec.heading} aria-labelledby={sec.id || sec.heading}>
              <h2 id={sec.id}>{sec.heading}</h2>
              {sec.paragraphs?.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {sec.bullets?.length > 0 && (
                <ul>
                  {sec.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              {sec.comparisonTable && <ComparisonTable table={sec.comparisonTable} />}
              {sec.qa?.map((item) => (
                <div key={item.q} className="ip-qa-block">
                  <h3>{item.q}</h3>
                  <p>{item.a}</p>
                </div>
              ))}
            </section>
          ))}
          {howTo && <HowToSteps howTo={howTo} />}
          {comparisonTable && <ComparisonTable table={comparisonTable} />}
          <OfficialSources sources={officialSources} />
          <AuthorBio author={author} />
          <GuideRelatedLinks relatedGuides={relatedGuides} />
        </div>
      </article>

      <GuideFaqBlock faqs={faqs} />

      <section className="ip-cta">
        <div className="ln-container">
          <div className="ip-cta-inner">
            <h2 className="ip-cta-title">Try JedMee free for 14 days</h2>
            <p className="ip-cta-sub">
              Tax billing, inventory, expiry alerts, and wholesale orders — one cloud platform. No credit card required.
            </p>
            <div className="ip-cta-btns">
              <Link to="/register" className="ln-btn ln-btn--white ln-btn--lg">Start free trial</Link>
              <Link to="/free-trial" className="ln-btn ln-btn--outline-white ln-btn--lg">Free trial details</Link>
              <a href="/#pricing" className="ln-btn ln-btn--outline-white ln-btn--lg">View pricing</a>
            </div>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
