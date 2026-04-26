import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const CAT_COLORS = {
  'Quote':      { bg: '#f0f7ff', color: '#1e40af' },
  'Details':    { bg: '#f9fafb', color: '#374151' },
  'Managed IT': { bg: '#eff6ff', color: '#1d4ed8' },
  'Products':   { bg: '#faf5ff', color: '#6d28d9' },
  'Voice':      { bg: '#fdf4ff', color: '#7c3aed' },
  'Pricing':    { bg: '#f0fdf4', color: '#166534' },
};

export default function QuoteHistory({ quoteId }) {
  const [versions, setVersions]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [expanded, setExpanded]   = useState(new Set());

  async function load() {
    if (!quoteId) return;
    const { data } = await supabase
      .from('quote_versions')
      .select('*')
      .eq('quote_id', quoteId)
      .order('version', { ascending: false });
    setVersions(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [quoteId]);

  function toggle(id) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs  = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1)  return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHrs < 24)  return `${diffHrs}h ago`;
    if (diffDays < 7)  return `${diffDays}d ago`;
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function getDeltaColor(delta) {
    if (!delta) return '#374151';
    return delta > 0 ? '#dc2626' : '#166534';
  }

  function getDeltaLabel(delta) {
    if (!delta) return null;
    const sign = delta > 0 ? '+' : '';
    return `${sign}$${Math.abs(Math.round(delta))}/mo`;
  }

  if (!quoteId) return null;

  return (
    <div style={{ background: 'white', borderRadius: 6, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 2, height: 11, background: '#0891b2', borderRadius: 2 }}/>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#374151' }}>
            Revision History
          </span>
          {versions.length > 0 && (
            <span style={{ fontSize: 10, color: '#9ca3af' }}>({versions.length} version{versions.length !== 1 ? 's' : ''})</span>
          )}
        </div>
        <button onClick={load} style={{ background: 'none', border: 'none', fontSize: 11, color: '#9ca3af', cursor: 'pointer' }}>↺</button>
      </div>

      {/* Version list */}
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '12px 14px', fontSize: 11, color: '#9ca3af' }}>Loading...</div>}

        {!loading && versions.length === 0 && (
          <div style={{ padding: '14px', fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
            No revisions yet — save the quote to start tracking changes
          </div>
        )}

        {versions.map((ver, i) => {
          const diff    = ver.diff || { changes: [] };
          const isOpen  = expanded.has(ver.id);
          const isFirst = i === versions.length - 1;
          const hasChanges = diff.changes?.length > 0;

          // Group changes by category
          const byCategory = {};
          for (const c of (diff.changes || [])) {
            if (!byCategory[c.category]) byCategory[c.category] = [];
            byCategory[c.category].push(c);
          }

          const mrrChange = diff.changes?.find(c => c.field === 'Monthly MRR');

          return (
            <div key={ver.id} style={{ borderBottom: i < versions.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
              {/* Version row */}
              <div onClick={() => hasChanges && toggle(ver.id)}
                style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: hasChanges ? 'pointer' : 'default',
                  background: i === 0 ? '#f8faff' : 'white' }}
                onMouseEnter={e => { if (hasChanges) e.currentTarget.style.background = '#f0f7ff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = i === 0 ? '#f8faff' : 'white'; }}>

                {/* Version badge */}
                <div style={{ width: 28, height: 20, borderRadius: 3, background: i === 0 ? '#0f1e3c' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: i === 0 ? 'white' : '#64748b' }}>v{ver.version}</span>
                </div>

                {/* Summary */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isFirst ? 'Initial save' : diff.note ? (
                      <span style={{ color: '#0f766e', fontWeight: 600 }}>📝 {diff.note}</span>
                    ) : ver.change_summary || 'No changes detected'}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1, display: 'flex', gap: 6 }}>
                    <span>{ver.saved_by_name || ver.saved_by_email?.split('@')[0] || 'Team'}</span>
                    <span>·</span>
                    <span>{formatTime(ver.created_at)}</span>
                  </div>
                </div>

                {/* MRR delta */}
                {mrrChange?.delta && (
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: getDeltaColor(mrrChange.delta), flexShrink: 0 }}>
                    {getDeltaLabel(mrrChange.delta)}
                  </span>
                )}

                {/* Change count */}
                {hasChanges && !isFirst && (
                  <span style={{ fontSize: 9, color: '#9ca3af', flexShrink: 0 }}>
                    {diff.changes.length} field{diff.changes.length !== 1 ? 's' : ''} {isOpen ? '▲' : '▼'}
                  </span>
                )}
              </div>

              {/* Expanded diff */}
              {isOpen && hasChanges && (
                <div style={{ padding: '6px 14px 10px', background: '#fafafa', borderTop: '1px solid #f3f4f6' }}>
                  {Object.entries(byCategory).map(([cat, changes]) => {
                    const catStyle = CAT_COLORS[cat] || { bg: '#f9fafb', color: '#374151' };
                    return (
                      <div key={cat} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: catStyle.color, background: catStyle.bg, padding: '1px 6px', borderRadius: 3, display: 'inline-block', marginBottom: 4 }}>
                          {cat}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <tbody>
                            {changes.map((c, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '3px 4px', color: '#6b7280', width: '35%', fontSize: 10 }}>{c.field}</td>
                                <td style={{ padding: '3px 4px', color: c.type === 'remove' ? '#dc2626' : '#9ca3af', textDecoration: c.type === 'remove' ? 'none' : 'line-through', fontSize: 10, textAlign: 'right', width: '28%' }}>
                                  {c.from}
                                </td>
                                <td style={{ padding: '3px 6px', color: '#6b7280', fontSize: 10, textAlign: 'center', width: '4%' }}>→</td>
                                <td style={{ padding: '3px 4px', color: c.type === 'add' ? '#166534' : c.delta > 0 ? '#dc2626' : c.delta < 0 ? '#166534' : '#0f1e3c', fontWeight: 600, fontSize: 10, width: '33%' }}>
                                  {c.to}
                                  {c.delta && <span style={{ fontSize: 9, marginLeft: 4, color: getDeltaColor(c.delta) }}>({getDeltaLabel(c.delta)})</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
