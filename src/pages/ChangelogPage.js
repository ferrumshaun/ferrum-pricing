import React, { useState, useEffect } from 'react';
import changelog from '../data/changelog.json';
import { useAuth } from '../contexts/AuthContext';

const STORAGE_KEY = 'ferrum_changelog_last_seen';

const AUDIENCE_LABEL = { all: 'All Users', admin: 'Admins' };
const AUDIENCE_COLOR = { all: '#166534', admin: '#1e40af' };
const AUDIENCE_BG    = { all: '#dcfce7', admin: '#dbeafe' };

const CAT_CONFIG = {
  new:      { label: 'New',       color: '#166534', bg: '#dcfce7', icon: '✦' },
  improved: { label: 'Improved',  color: '#0f766e', bg: '#d1fae5', icon: '↑' },
  fixed:    { label: 'Fixed',     color: '#1e40af', bg: '#dbeafe', icon: '✓' },
};

export default function ChangelogPage() {
  const { isAdmin } = useAuth();
  const [lastSeen,   setLastSeen]   = useState(null);
  const [expanded,   setExpanded]   = useState(new Set([changelog[0]?.version]));

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setLastSeen(stored);
    // Mark as seen
    localStorage.setItem(STORAGE_KEY, changelog[0]?.version);
  }, []);

  function toggleExpand(version) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(version) ? next.delete(version) : next.add(version);
      return next;
    });
  }

  // Count unseen releases
  const unseenCount = lastSeen
    ? changelog.filter(r => r.version > lastSeen).length
    : changelog.length;

  // Filter out admin-only entries for non-admins
  const visible = changelog.filter(r => isAdmin || r.audience !== 'admin');

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 16px', overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f1e3c', margin: 0 }}>What's New</h1>
          {unseenCount > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, background: '#2563eb', color: 'white', padding: '2px 7px', borderRadius: 10 }}>
              {unseenCount} new
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
          Release history for the FerrumIT Pricing Platform — every feature, fix, and improvement documented.
        </p>
      </div>

      {/* Timeline */}
      <div style={{ position: 'relative' }}>
        {/* Vertical line */}
        <div style={{ position: 'absolute', left: 16, top: 0, bottom: 0, width: 2, background: '#e5e7eb', zIndex: 0 }}/>

        {visible.map((release, i) => {
          const isNew     = lastSeen && release.version > lastSeen;
          const isOpen    = expanded.has(release.version);
          const totalItems = Object.values(release.categories).flat().length;
          const hasContent = Object.values(release.categories).some(arr => arr.length > 0);

          return (
            <div key={release.version} style={{ position: 'relative', paddingLeft: 44, marginBottom: 16 }}>
              {/* Dot */}
              <div style={{ position: 'absolute', left: 8, top: 14, width: 18, height: 18, borderRadius: '50%', background: i === 0 ? '#2563eb' : '#e5e7eb', border: `3px solid ${i === 0 ? '#2563eb' : '#d1d5db'}`, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {i === 0 && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }}/>}
              </div>

              {/* Card */}
              <div style={{ background: 'white', borderRadius: 8, border: `1px solid ${isNew ? '#bfdbfe' : '#e5e7eb'}`, overflow: 'hidden', boxShadow: isNew ? '0 0 0 3px #eff6ff' : 'none' }}>
                {/* Card header */}
                <div onClick={() => hasContent && toggleExpand(release.version)}
                  style={{ padding: '12px 16px', cursor: hasContent ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 10, background: i === 0 ? '#f8faff' : 'white' }}>

                  {/* Version badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: '#0f1e3c', background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>
                      v{release.version}
                    </span>
                    {isNew && (
                      <span style={{ fontSize: 9, fontWeight: 700, background: '#2563eb', color: 'white', padding: '1px 6px', borderRadius: 8 }}>NEW</span>
                    )}
                  </div>

                  {/* Summary */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0f1e3c', lineHeight: 1.4 }}>{release.summary}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      <span style={{ fontSize: 10, color: '#9ca3af' }}>{new Date(release.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                      <span style={{ fontSize: 9, fontWeight: 600, background: AUDIENCE_BG[release.audience], color: AUDIENCE_COLOR[release.audience], padding: '1px 5px', borderRadius: 3 }}>
                        {AUDIENCE_LABEL[release.audience]}
                      </span>
                      {hasContent && (
                        <span style={{ fontSize: 10, color: '#9ca3af' }}>{totalItems} change{totalItems !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>

                  {/* Category pills */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {Object.entries(release.categories).map(([key, items]) => {
                      if (!items.length) return null;
                      const cfg = CAT_CONFIG[key];
                      return (
                        <span key={key} style={{ fontSize: 9, fontWeight: 700, background: cfg.bg, color: cfg.color, padding: '2px 6px', borderRadius: 3 }}>
                          {cfg.icon} {items.length} {cfg.label}
                        </span>
                      );
                    })}
                  </div>

                  {hasContent && (
                    <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                  )}
                </div>

                {/* Expanded details */}
                {isOpen && hasContent && (
                  <div style={{ padding: '0 16px 14px', borderTop: '1px solid #f3f4f6' }}>
                    {Object.entries(release.categories).map(([key, items]) => {
                      if (!items.length) return null;
                      const cfg = CAT_CONFIG[key];
                      return (
                        <div key={key} style={{ marginTop: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', background: cfg.bg, color: cfg.color, padding: '2px 7px', borderRadius: 3 }}>
                              {cfg.icon} {cfg.label}
                            </span>
                          </div>
                          <ul style={{ margin: 0, padding: '0 0 0 16px', listStyle: 'none' }}>
                            {items.map((item, idx) => (
                              <li key={idx} style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, marginBottom: 3, display: 'flex', gap: 6 }}>
                                <span style={{ color: cfg.color, flexShrink: 0, fontSize: 10, marginTop: 3 }}>•</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af', fontSize: 11 }}>
        FerrumIT Pricing Platform · Built by FerrumIT with Anthropic Claude
      </div>
    </div>
  );
}
