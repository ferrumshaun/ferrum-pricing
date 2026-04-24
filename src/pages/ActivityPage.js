import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const ACTION_COLORS = {
  CREATE: '#dcfce7', UPDATE: '#dbeafe', DELETE: '#fee2e2',
  ACTIVATE: '#dcfce7', DEACTIVATE: '#fef3c7'
};
const ACTION_TEXT = {
  CREATE: '#166534', UPDATE: '#1e40af', DELETE: '#991b1b',
  ACTIVATE: '#166534', DEACTIVATE: '#92400e'
};

export default function ActivityPage() {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState({ entity: '', user: '', action: '' });
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  async function load() {
    setLoading(true);
    let q = supabase.from('activity_log').select('*').order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (filter.entity) q = q.eq('entity_type', filter.entity);
    if (filter.user)   q = q.ilike('user_email', `%${filter.user}%`);
    if (filter.action) q = q.eq('action', filter.action);
    const { data } = await q;
    setLogs(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [page, filter]);

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f1e3c' }}>Activity Log</h2>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>All changes to products, packages, settings, quotes, and users</p>
        </div>
        <button onClick={load} style={{ padding: '5px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 11 }}>↺ Refresh</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[['entity', 'Entity type', ['product','package','market_tier','setting','user','quote']],
          ['action', 'Action',      ['CREATE','UPDATE','DELETE','ACTIVATE','DEACTIVATE']]].map(([key, placeholder, opts]) => (
          <select key={key} value={filter[key]} onChange={e => { setFilter(f => ({...f, [key]: e.target.value})); setPage(0); }}
            style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, background: 'white', color: '#374151' }}>
            <option value="">All {placeholder}s</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        <input value={filter.user} onChange={e => { setFilter(f => ({...f, user: e.target.value})); setPage(0); }}
          placeholder="Filter by user email..." style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, minWidth: 200 }} />
        <button onClick={() => { setFilter({ entity: '', user: '', action: '' }); setPage(0); }}
          style={{ padding: '5px 8px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 11 }}>Clear</button>
      </div>

      {loading ? <div style={{ padding: 20, color: '#6b7280', fontSize: 12 }}>Loading...</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['When','User','Action','Entity','Name','Changes'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <React.Fragment key={log.id}>
                <tr style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? 'white' : '#fafafa', cursor: log.changes ? 'pointer' : 'default' }}
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                  <td style={{ padding: '7px 10px', color: '#6b7280', whiteSpace: 'nowrap', fontSize: 11 }}>
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '7px 10px', color: '#374151' }}>{log.user_email?.split('@')[0]}</td>
                  <td style={{ padding: '7px 10px' }}>
                    <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700, background: ACTION_COLORS[log.action] || '#f3f4f6', color: ACTION_TEXT[log.action] || '#374151' }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: '7px 10px', color: '#6b7280' }}>{log.entity_type}</td>
                  <td style={{ padding: '7px 10px', fontWeight: 500, color: '#374151' }}>{log.entity_name}</td>
                  <td style={{ padding: '7px 10px', color: '#6b7280', fontSize: 11 }}>
                    {log.changes ? (
                      <span style={{ color: '#2563eb' }}>{expanded === log.id ? '▲ hide' : `▼ ${Object.keys(log.changes).length} field${Object.keys(log.changes).length !== 1 ? 's' : ''}`}</span>
                    ) : '—'}
                  </td>
                </tr>
                {expanded === log.id && log.changes && (
                  <tr style={{ background: '#f0f7ff' }}>
                    <td colSpan={6} style={{ padding: '8px 10px 10px 36px' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead><tr>{['Field','From','To'].map(h => <th key={h} style={{ textAlign: 'left', padding: '2px 12px 4px 0', color: '#6b7280', fontWeight: 600 }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {Object.entries(log.changes).map(([field, change]) => (
                            <tr key={field}>
                              <td style={{ padding: '2px 12px 2px 0', fontWeight: 600, color: '#374151' }}>{field}</td>
                              <td style={{ padding: '2px 12px 2px 0', color: '#dc2626', fontFamily: 'monospace' }}>{JSON.stringify(change.from ?? change)}</td>
                              <td style={{ padding: '2px 0', color: '#166534', fontFamily: 'monospace' }}>{change.to !== undefined ? JSON.stringify(change.to) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
      {/* Pagination */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: '4px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 11, opacity: page === 0 ? 0.5 : 1 }}>← Prev</button>
        <span style={{ padding: '4px 8px', fontSize: 11, color: '#6b7280' }}>Page {page + 1}</span>
        <button onClick={() => setPage(p => p + 1)} disabled={logs.length < PAGE_SIZE} style={{ padding: '4px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 11, opacity: logs.length < PAGE_SIZE ? 0.5 : 1 }}>Next →</button>
      </div>
    </div>
  );
}
