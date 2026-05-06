import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { readAuth } from '../services/authStorage.js';

const API = import.meta.env.VITE_API_URL || '';

const STATUS_COLORS = {
  DRAFT:     { bg: '#fff8e1', color: '#f59e0b', label: 'Draft' },
  CONFIRMED: { bg: '#e8f5e9', color: '#22c55e', label: 'Confirmed' },
  CANCELLED: { bg: '#fce4ec', color: '#ef4444', label: 'Cancelled' },
};

function fmt(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PurchaseReturnsPage() {
  const navigate = useNavigate();
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState('');
  const [page, setPage]         = useState(1);
  const [pagination, setPagination] = useState({});
  const [error, setError]       = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { token } = readAuth();
      const qs = new URLSearchParams({ page, limit: 20 });
      if (search) qs.set('search', search);
      if (status) qs.set('status', status);
      const res = await fetch(`${API}/purchase-returns?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load');
      setItems(data.items || []);
      setPagination(data.pagination || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  async function confirmReturn(id) {
    if (!confirm('Confirm this purchase return? Stock will be adjusted.')) return;
    try {
      const { token } = readAuth();
      const res = await fetch(`${API}/purchase-returns/${id}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to confirm');
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Purchase Returns</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            Manage returns to vendors with credit note tracking
          </p>
        </div>
        <button
          onClick={() => navigate('/purchase-returns/new')}
          style={{
            background: '#6b3fa0', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 14,
          }}
        >
          + New Return
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search return # or credit note…"
          style={{
            flex: 1, minWidth: 200, padding: '9px 14px', border: '1px solid #e2e8f0',
            borderRadius: 8, fontSize: 14, outline: 'none',
          }}
        />
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1); }}
          style={{
            padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
            fontSize: 14, background: '#fff', cursor: 'pointer',
          }}
        >
          <option value="">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <button
          onClick={load}
          style={{
            padding: '9px 18px', background: '#f1f5f9', border: '1px solid #e2e8f0',
            borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500,
          }}
        >
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fce4ec', color: '#c62828', padding: '12px 16px', borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <div style={{ fontWeight: 600, color: '#475569' }}>No purchase returns found</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Create a return against a purchase invoice</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Return #', 'Date', 'Vendor / Division', 'Original Invoice', 'Reason', 'Amount', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => {
                const sc = STATUS_COLORS[r.status] || STATUS_COLORS.DRAFT;
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#6b3fa0', fontSize: 14 }}>
                      {r.return_number}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>
                      {r.return_date ? new Date(r.return_date).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#1e293b' }}>
                      {r.vendor_name || r.division_name || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>
                      {r.original_invoice_number || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>
                      {(r.return_reason || '').replace(/_/g, ' ')}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                      ₹{fmt(r.total_amount)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        background: sc.bg, color: sc.color, padding: '3px 10px',
                        borderRadius: 20, fontSize: 12, fontWeight: 600,
                      }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => navigate(`/purchase-returns/${r.id}`)}
                          style={{
                            padding: '5px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0',
                            borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                          }}
                        >
                          View
                        </button>
                        {r.status === 'DRAFT' && (
                          <button
                            onClick={() => confirmReturn(r.id)}
                            style={{
                              padding: '5px 12px', background: '#e8f5e9', color: '#22c55e',
                              border: '1px solid #bbf7d0', borderRadius: 6, cursor: 'pointer',
                              fontSize: 12, fontWeight: 600,
                            }}
                          >
                            Confirm
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: page <= 1 ? 'not-allowed' : 'pointer', background: '#fff' }}
          >
            ← Prev
          </button>
          <span style={{ padding: '7px 16px', color: '#64748b', fontSize: 14 }}>
            Page {page} of {pagination.pages}
          </span>
          <button
            disabled={page >= pagination.pages}
            onClick={() => setPage(p => p + 1)}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: page >= pagination.pages ? 'not-allowed' : 'pointer', background: '#fff' }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}