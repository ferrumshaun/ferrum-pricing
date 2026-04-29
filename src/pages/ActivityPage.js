import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const ACTION_COLORS = {
  CREATE: '#dcfce7', UPDATE: '#dbeafe', DELETE: '#fee2e2',
  ACTIVATE: '#dcfce7', DEACTIVATE: '#fef3c7'
};
const ACTION_TEXT = {
  CREATE: '#166534', UPDATE: '#1e40af', DELETE: '#991b1b',
  ACTIVATE: '#166534', DEACTIVATE: '#92400e'
};

const PAGE_SIZE = 50;
const FILTER_DEBOUNCE_MS = 300;

export default function ActivityPage() {
  const [logs,       setLogs]       = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(0);
  const [expanded,   setExpanded]   = useState(null);

  // Two layers of filter state:
  //   - filter:        the value used for the actual Supabase query
  //   - filterDraft:   what's in the input field right now (drives debounce)
  // For dropdowns (entity, action) the two are kept in sync immediately.
  // For the free-text user filter, filterDraft updates on every keystroke,
  // and `filter.user` only updates after FILTER_DEBOUNCE_MS of inactivity.
  const [filter,      setFilter]      = useState({ entity: '', user: '', action: '' });
  const [filterDraft, setFilterDraft] = useState({ entity: '', user: '', action: '' });

  // Debounce the user-email filter
  const userDebounceRef = useRef(null);
  useEffect(() => {
    if (userDebounceRef.current) clearTimeout(userDebounceRef.current);
    userDebounceRef.current = setTimeout(() => {
      if (filterDraft.user !== filter.user) {
        setFilter(f => ({ ...f, user: filterDraft.user }));
        setPage(0);
      }
    }, FILTER_DEBOUNCE_MS);
    return () => userDebounceRef.current && clearTimeout(userDebounceRef.current);
  }, [filterDraft.user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    let q = supabase.from('activity_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (filter.entity) q = q.eq('entity_type', filter.entity);
    if (filter.user)   q = q.ilike('user_email', `%${filter.user}%`);
    if (filter.action) q = q.eq('action', filter.action);
    const { data, count } = await q;
    setLogs(data || []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }
  useEffect(() => { load(); }, [page, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const isLastPage = page >= totalPages - 1;

  function clearFilters() {
    setFilter({ entity: '', user: '', action: '' });
    setFilterDraft({ entity: '', user: '', action: '' });
    setPage(0);
  }

  function setDropdownFilter(key, value) {
    // Dropdown filters apply immediately (no debounce)
    setFilter(f => ({ ...f, [key]: value }));
    setFilterDraft(f => ({ ...f, [key]: value }));
    setPage(0);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* ── HEADER (fixed) ───────────────────────────────────────────── */}
      <div style={{ padding: '16px 16px 0', maxWidth: 1100, margin: '0 auto', width: '100%', boxSizing: 'border-box', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f1e3c', margin: 0 }}>Activity Log</h2>
            <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2, marginBottom: 0 }}>All changes to products, packages, settings, quotes, and users</p>
          </div>
          <button onClick={load} style={{ padding: '5px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>↺ Refresh</button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['entity', 'Entity type', ['product','package','market_tier','setting','user','quote']],
            ['action', 'Action',      ['CREATE','UPDATE','DELETE','ACTIVATE','DEACTIVATE']]].map(([key, placeholder, opts]) => (
            <select key={key} value={filterDraft[key]} onChange={e => setDropdownFilter(key, e.target.value)}
              style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, background: 'white', color: '#374151' }}>
              <option value="">All {placeholder}s</option>
              {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          <input value={filterDraft.user}
            onChange={e => setFilterDraft(f => ({ ...f, user: e.target.value }))}
            placeholder="Filter by user email..."
            style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, minWidth: 200 }} />
          <button onClick={clearFilters}
            style={{ padding: '5px 8px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Clear</button>
          {/* Subtle status indicator: shows when the displayed user filter is still being typed */}
          {filterDraft.user !== filter.user && (
            <span style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>typing…</span>
          )}
        </div>
      </div>

      {/* ── TABLE (scrollable middle) ───────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 16px', maxWidth: 1100, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {loading ? <div style={{ padding: 20, color: '#6b7280', fontSize: 12 }}>Loading...</div> : (
          logs.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
              No activity matches the current filters.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>
                <tr>
                  {['When','User','Action','Entity','Name','Changes'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', background: '#f9fafb' }}>{h}</th>
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
          )
        )}
      </div>

      {/* ── FOOTER (pinned, pagination) ─────────────────────────────── */}
      <div style={{ flexShrink: 0, borderTop: '1px solid #e5e7eb', background: 'white', padding: '10px 16px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            {totalCount > 0
              ? <>Page <strong style={{ color: '#374151' }}>{page + 1}</strong> of <strong style={{ color: '#374151' }}>{totalPages}</strong> · {totalCount.toLocaleString()} {totalCount === 1 ? 'entry' : 'entries'}</>
              : (loading ? 'Loading…' : 'No entries')}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              style={{ padding: '4px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 11, cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>← Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={isLastPage}
              style={{ padding: '4px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 11, cursor: isLastPage ? 'not-allowed' : 'pointer', opacity: isLastPage ? 0.5 : 1 }}>Next →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
