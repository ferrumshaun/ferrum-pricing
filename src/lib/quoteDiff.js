// Quote diff engine — compares two quote snapshots and returns human-readable changes

// Fields we care about with display labels
const IT_FIELDS = {
  users:              { label: 'Users',               fmt: v => v },
  sharedMailboxes:    { label: 'Shared Mailboxes',    fmt: v => v },
  workstations:       { label: 'Workstations',        fmt: v => v },
  endpoints:          { label: 'Total Devices',       fmt: v => v },
  mobileDevices:      { label: 'Mobile Devices',      fmt: v => v },
  servers:            { label: 'Servers',             fmt: v => v },
  locations:          { label: 'Locations',           fmt: v => v },
  cloudTenants:       { label: 'Cloud Tenants',       fmt: v => v },
  vendors:            { label: 'Vendors',             fmt: v => v },
  requestedCoverage:  { label: 'Coverage',            fmt: v => ({ business_hours:'8×5', '24x5':'24×5', '24x7':'24×7' }[v] || v) },
  compliance:         { label: 'Compliance',          fmt: v => ({ none:'None', moderate:'HIPAA/SOC2', high:'PCI/CMMC' }[v] || v) },
  industryRisk:       { label: 'Industry Risk',       fmt: v => v.charAt(0).toUpperCase() + v.slice(1) },
  complexity:         { label: 'Complexity',          fmt: v => v.charAt(0).toUpperCase() + v.slice(1) },
  contractTerm:       { label: 'Contract Term',       fmt: v => `${v} months` },
  execReporting:      { label: 'Exec Reporting',      fmt: v => v ? 'Yes' : 'No' },
};

const QUOTE_FIELDS = {
  client_name:   { label: 'Client Name' },
  client_zip:    { label: 'Zip Code' },
  market_tier:   { label: 'Market Tier',   fmt: v => v?.replace(/_/g, ' ') },
  package_name:  { label: 'Package' },
  status:        { label: 'Status',         fmt: v => v.charAt(0).toUpperCase() + v.slice(1) },
};

const INPUT_META_FIELDS = {
  proposalName:     { label: 'Proposal Name' },
  recipientContact: { label: 'Contact Name' },
  recipientEmail:   { label: 'Contact Email' },
  recipientAddress: { label: 'Address' },
};

// Voice fields to track
const VOICE_FIELDS = {
  quoteType:     { label: 'Voice Type',       fmt: v => ({ hosted:'Hosted Seats', hybrid:'Hybrid Hosting', sip:'SIP Trunking' }[v] || v) },
  seats:         { label: 'Voice Seats',      fmt: v => v },
  seatPrice:     { label: 'Seat Price',       fmt: v => `$${v}` },
  licenseType:   { label: 'License Type',     fmt: v => v?.charAt(0).toUpperCase() + v?.slice(1) },
  sipChannels:   { label: 'SIP Channels',     fmt: v => v },
  localDIDs:     { label: 'Local DIDs',       fmt: v => v },
  smsDIDs:       { label: 'SMS DIDs',         fmt: v => v },
  tollFreeNumbers:{ label: 'Toll-Free Numbers',fmt: v => v },
  e911DIDs:      { label: 'E911 DIDs',        fmt: v => v },
  faxType:       { label: 'Fax Package',      fmt: v => v },
  callRecording: { label: 'Call Recording',   fmt: v => v ? 'On' : 'Off' },
  smsEnabled:    { label: 'SMS/MMS',          fmt: v => v ? 'On' : 'Off' },
  hardwareType:  { label: 'Hardware',         fmt: v => v },
  hardwareModel: { label: 'Hardware Model',   fmt: v => v },
  hardwareQty:   { label: 'Hardware Qty',     fmt: v => v },
  isManagedIT:   { label: 'Bundle Discount',  fmt: v => v ? 'Applied' : 'Not applied' },
};

function fmt(field, val) {
  if (val === undefined || val === null) return '—';
  return field.fmt ? field.fmt(val) : String(val);
}

function changed(a, b) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function computeDiff(prev, curr) {
  if (!prev) return { changes: [], summary: 'Initial save' };

  const changes = [];

  // Top-level quote fields
  for (const [key, field] of Object.entries(QUOTE_FIELDS)) {
    if (changed(prev[key], curr[key])) {
      changes.push({ category: 'Quote', field: field.label, from: fmt(field, prev[key]), to: fmt(field, curr[key]) });
    }
  }

  // Input meta fields (proposalName, contact etc)
  const prevInputs = prev.inputs || {};
  const currInputs = curr.inputs || {};
  for (const [key, field] of Object.entries(INPUT_META_FIELDS)) {
    if (changed(prevInputs[key], currInputs[key])) {
      changes.push({ category: 'Details', field: field.label, from: fmt(field, prevInputs[key]), to: fmt(field, currInputs[key]) });
    }
  }

  // IT inputs
  const prevIT = prevInputs.it || prevInputs; // bundle stores under .it, standalone at top level
  const currIT = currInputs.it || currInputs;
  for (const [key, field] of Object.entries(IT_FIELDS)) {
    const pv = prevIT[key] ?? (prev.inputs?.[key]);
    const cv = currIT[key] ?? (curr.inputs?.[key]);
    if (changed(pv, cv) && (pv !== undefined || cv !== undefined)) {
      changes.push({ category: 'Managed IT', field: field.label, from: fmt(field, pv), to: fmt(field, cv) });
    }
  }

  // Selected products — track adds and removes
  const prevProds = new Set(prevIT.selectedProducts || prev.inputs?.selectedProducts || []);
  const currProds = new Set(currIT.selectedProducts || curr.inputs?.selectedProducts || []);
  const prevLineNames = (prev.line_items || []).reduce((m, l) => { m[l.product_id] = l.product_name; return m; }, {});
  const currLineNames = (curr.line_items || []).reduce((m, l) => { m[l.product_id] = l.product_name; return m; }, {});
  for (const id of currProds) {
    if (!prevProds.has(id)) {
      changes.push({ category: 'Products', field: currLineNames[id] || id, from: '—', to: 'Added', type: 'add' });
    }
  }
  for (const id of prevProds) {
    if (!currProds.has(id)) {
      changes.push({ category: 'Products', field: prevLineNames[id] || id, from: 'Included', to: 'Removed', type: 'remove' });
    }
  }

  // Voice inputs (bundle or standalone voice)
  const prevVoice = prevInputs.voice;
  const currVoice = currInputs.voice;
  if (prevVoice || currVoice) {
    for (const [key, field] of Object.entries(VOICE_FIELDS)) {
      const pv = prevVoice?.[key];
      const cv = currVoice?.[key];
      if (changed(pv, cv) && (pv !== undefined || cv !== undefined)) {
        changes.push({ category: 'Voice', field: field.label, from: fmt(field, pv), to: fmt(field, cv) });
      }
    }
  }

  // Totals — track MRR and margin changes
  const prevTotals = prev.totals || {};
  const currTotals = curr.totals || {};
  if (changed(prevTotals.finalMRR, currTotals.finalMRR) && currTotals.finalMRR !== undefined) {
    const diff = (currTotals.finalMRR || 0) - (prevTotals.finalMRR || 0);
    changes.push({ category: 'Pricing', field: 'Monthly MRR', from: `$${Math.round(prevTotals.finalMRR || 0)}`, to: `$${Math.round(currTotals.finalMRR || 0)}`, delta: diff });
  }
  if (changed(prevTotals.impliedGM ?? prevTotals.gm, currTotals.impliedGM ?? currTotals.gm)) {
    const pg = prevTotals.impliedGM ?? prevTotals.gm ?? 0;
    const cg = currTotals.impliedGM ?? currTotals.gm ?? 0;
    changes.push({ category: 'Pricing', field: 'Gross Margin', from: `${(pg*100).toFixed(1)}%`, to: `${(cg*100).toFixed(1)}%` });
  }

  // Build summary
  const summary = buildSummary(changes);
  return { changes, summary };
}

function buildSummary(changes) {
  if (!changes.length) return 'No changes detected';

  // Group by category for the summary
  const cats = {};
  for (const c of changes) {
    if (!cats[c.category]) cats[c.category] = [];
    cats[c.category].push(c.field);
  }

  const parts = Object.entries(cats).map(([cat, fields]) => {
    if (fields.length === 1) return `${fields[0]}`;
    return `${fields.length} ${cat} changes`;
  });

  return parts.slice(0, 3).join(', ') + (parts.length > 3 ? ` +${parts.length - 3} more` : '');
}

// Build a full snapshot object from current quote state
export function buildSnapshot(quoteData, inputs, totals, lineItems) {
  return {
    client_name:  quoteData.client_name,
    client_zip:   quoteData.client_zip,
    market_tier:  quoteData.market_tier,
    package_name: quoteData.package_name,
    status:       quoteData.status,
    inputs,
    totals,
    line_items: lineItems,
    snapshotAt: new Date().toISOString(),
  };
}
