function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function inr(v) {
  return `Rs.${n(v).toFixed(2)}`;
}

function safeFilePart(s) {
  return String(s || "doc").replace(/[^\w.-]+/g, "_").slice(0, 80);
}

module.exports = { n, inr, safeFilePart };
