// GMBadge — gross margin warning badge for quote cost panels.
//
// Added v3.5.34. Reads target_gross_margin from settings, compares to the
// quote's currentGM, renders a three-state badge:
//   - green "at target" when GM ≥ target
//   - amber "X points below target" when GM is within 5 points
//   - red "underpriced — X points below target" when GM is more than 5 points below
//   - gray informational variant on locked quotes (deal is done — advice no longer actionable)
//
// If targetGM is null/undefined/0, the badge hides entirely. This lets admin
// disable the warning by clearing the pricing_settings value.
//
// Props:
//   currentGM  — number (e.g., 0.32 for 32%). NaN/undefined hides the badge.
//   targetGM   — number (e.g., 0.40 for 40%). null/undefined/0 hides the badge.
//   locked     — boolean. When true, badge renders muted gray regardless of state.
//   compact    — boolean. When true, renders a single-line compact badge for
//                tight spaces. Default false (full multi-line variant).

import React from 'react';

export default function GMBadge({ currentGM, targetGM, locked = false, compact = false }) {
  // Skip rendering if we don't have valid numbers
  if (typeof currentGM !== 'number' || isNaN(currentGM)) return null;
  if (!targetGM || typeof targetGM !== 'number' || targetGM <= 0) return null;

  const deltaPoints = (currentGM - targetGM) * 100; // positive = above target, negative = below
  const atTarget    = deltaPoints >= 0;
  const slightlyBelow = !atTarget && deltaPoints >= -5;
  // significantlyBelow when deltaPoints < -5

  // Locked quotes get a muted gray treatment regardless of state
  let bg, border, color, icon, label;
  if (locked) {
    bg     = '#f3f4f6';
    border = '#d1d5db';
    color  = '#6b7280';
    icon   = 'ℹ';
    label  = atTarget
      ? `GM ${(currentGM * 100).toFixed(1)}% — locked at target (${(targetGM * 100).toFixed(0)}%)`
      : `GM ${(currentGM * 100).toFixed(1)}% — locked, ${Math.abs(deltaPoints).toFixed(1)} points below ${(targetGM * 100).toFixed(0)}% target`;
  } else if (atTarget) {
    bg     = '#dcfce7';
    border = '#86efac';
    color  = '#166534';
    icon   = '✓';
    label  = `GM ${(currentGM * 100).toFixed(1)}% — at target (${(targetGM * 100).toFixed(0)}%)`;
  } else if (slightlyBelow) {
    bg     = '#fef3c7';
    border = '#fde68a';
    color  = '#92400e';
    icon   = '⚠';
    label  = `GM ${(currentGM * 100).toFixed(1)}% — ${Math.abs(deltaPoints).toFixed(1)} points below ${(targetGM * 100).toFixed(0)}% target`;
  } else {
    bg     = '#fee2e2';
    border = '#fca5a5';
    color  = '#991b1b';
    icon   = '⚠';
    label  = `GM ${(currentGM * 100).toFixed(1)}% — ${Math.abs(deltaPoints).toFixed(1)} points below ${(targetGM * 100).toFixed(0)}% target`;
  }

  if (compact) {
    return (
      <span title={label}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 6px',
          background: bg, border: `1px solid ${border}`, borderRadius: 3,
          fontSize: 9, color, fontWeight: 600,
          whiteSpace: 'nowrap',
        }}>
        <span style={{ fontSize: 10 }}>{icon}</span>
        <span>{(currentGM * 100).toFixed(1)}% / {(targetGM * 100).toFixed(0)}%</span>
      </span>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 8px',
      background: bg, border: `1px solid ${border}`, borderRadius: 4,
      fontSize: 10, color, fontWeight: 600,
      lineHeight: 1.3,
    }}>
      <span style={{ fontSize: 11 }}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}
