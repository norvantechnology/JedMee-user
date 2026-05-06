import { useState } from 'react';
import { readAuth } from '../services/authStorage.js';

const API = import.meta.env.VITE_API_URL || '';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Default to current month
function defaultDates() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${lastDay}` };
}

export default function GstReportPage() {
  const def = defaultDates();
  const [fromDate, setFromDate] = useState(def.from);
  const [toDate, setToDate]     = useState(def.to);
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function loadReport() {
    if (!fromDate || !toDate) { setError('Please select both dates.'); return; }
    setLoading(true); setError(''); setData(null);
    try {
      const { token } = readAuth();
      const qs = new URLSearchParams({ from_date: fromDate, to_date: toDate });
      const res = await fetch(`${API}/reports/gst-r1?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to load report');
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!data?.hsn_summary?.length) return;
    const rows = [
      ['HSN Code', 'GST Rate %', 'Invoices', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Value'],
      ...data.hsn_summary.map(r => [
        r.hsn_code, r.gst_rate, r.invoice_count,
        r.taxable_value, r.cgst, r.sgst, r.igst, r.total_value,
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `GSTR1_${fromDate}_${toDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const s = data?.summary || {};

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>GSTR-1 Summary Report</h1>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
          HSN-wise outward supply summary for GST filing
        </p>
      </div>

      {/* Filter bar */}
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
        padding: '20px 24px', marginBottom: 24, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>From Date</label>
          <input
            type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            style={{ padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>To Date</label>
          <input
            type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            style={{ padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
          />
        </div>
        <button
          onClick={loadReport} disabled={loading}
          style={{
            padding: '10px 24px', background: '#6b3fa0', color: '#fff', border: 'none',
            borderRadius: 8, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 14,
          }}
        >
          {loading ? 'Loading…' : 'Generate Report'}
        </button>
        {data && (
          <button
            onClick={exportCsv}
            style={{
              padding: '10px 20px', background: '#e8f5e9', color: '#22c55e',
              border: '1px solid #bbf7d0', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 14,
            }}
          >
            Export CSV
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: '#fce4ec', color: '#c62828', padding: '12px 16px', borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Invoices', value: s.total_invoices || 0, prefix: '', color: '#6b3fa0' },
              { label: 'Taxable Value', value: fmt(s.total_taxable), prefix: '₹', color: '#0ea5e9' },
              { label: 'Total Tax', value: fmt(s.total_tax), prefix: '₹', color: '#f59e0b' },
              { label: 'Total Value', value: fmt(s.total_value), prefix: '₹', color: '#22c55e' },
            ].map(c => (
              <div key={c.label} style={{
                background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
                padding: '20px 24px',
              }}>
                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {c.label}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: c.color, marginTop: 8 }}>
                  {c.prefix}{c.value}
                </div>
              </div>
            ))}
          </div>

          {/* HSN Summary */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 24, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#1e293b' }}>
              HSN-wise Summary
            </div>
            {data.hsn_summary?.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No data for selected period</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['HSN Code', 'GST Rate', 'Invoices', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Value'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', ':first-child': { textAlign: 'left' } }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.hsn_summary.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: '#1e293b', fontSize: 13 }}>{r.hsn_code}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: '#475569' }}>{r.gst_rate}%</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: '#475569' }}>{r.invoice_count}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: '#1e293b' }}>₹{fmt(r.taxable_value)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: '#475569' }}>₹{fmt(r.cgst)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: '#475569' }}>₹{fmt(r.sgst)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: '#475569' }}>₹{fmt(r.igst)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#6b3fa0' }}>₹{fmt(r.total_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* B2B */}
          {data.b2b?.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 24, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#1e293b' }}>
                B2B Supplies (Customers with GSTIN)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['GSTIN', 'Customer', 'Invoices', 'Total Tax', 'Total Value'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.b2b.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>{r.gstin}</td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: '#1e293b' }}>{r.customer_name}</td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: '#475569' }}>{r.invoice_count}</td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: '#475569' }}>₹{fmt(r.total_tax)}</td>
                      <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>₹{fmt(r.total_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* B2C */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
            <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>B2C Supplies (Walk-in / No GSTIN)</div>
            <div style={{ display: 'flex', gap: 32 }}>
              <div><span style={{ color: '#64748b', fontSize: 13 }}>Invoices: </span><strong>{data.b2c?.invoice_count || 0}</strong></div>
              <div><span style={{ color: '#64748b', fontSize: 13 }}>Total Tax: </span><strong>₹{fmt(data.b2c?.total_tax)}</strong></div>
              <div><span style={{ color: '#64748b', fontSize: 13 }}>Total Value: </span><strong>₹{fmt(data.b2c?.total_value)}</strong></div>
            </div>
          </div>
        </>
      )}

      {!data && !loading && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 48, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 600, color: '#475569' }}>Select a date range and click Generate Report</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>GSTR-1 summary with HSN-wise breakdown and B2B/B2C split</div>
        </div>
      )}
    </div>
  );
}