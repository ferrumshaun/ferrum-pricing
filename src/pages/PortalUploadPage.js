import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';

const DOC_CONFIG = {
  invoice: {
    label:    'Phone Bill / Invoice',
    icon:     '📄',
    color:    '#0369a1',
    bg:       '#f0f9ff',
    border:   '#bae6fd',
    desc:     'Most recent phone bill from your current carrier — must be dated within the last 60 days. Must show account number, service address, and all numbers to be ported.',
    required: true,
  },
  csr: {
    label:    'Customer Service Record (CSR)',
    icon:     '📋',
    color:    '#6d28d9',
    bg:       '#faf5ff',
    border:   '#ddd6fe',
    desc:     'The CSR is a detailed record from your current carrier listing all services and numbers on your account. Contact your carrier and request it specifically — it may take 1–2 business days.',
    required: true,
  },
  loa: {
    label:    'Letter of Authorization',
    icon:     '✍',
    color:    '#0f766e',
    bg:       '#f0fdf4',
    border:   '#a7f3d0',
    desc:     'The signed Letter of Authorization authorizing Ferrum Technology Services to port your numbers. You should have received this to sign electronically.',
    required: true,
  },
  other: {
    label:    'Additional Document',
    icon:     '📎',
    color:    '#374151',
    bg:       '#f8fafc',
    border:   '#e5e7eb',
    desc:     'Any other supporting document requested by your Ferrum representative.',
    required: false,
  },
};

const ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.tiff';
const MAX_MB  = 10;

export default function PortalUploadPage() {
  const { token } = useParams();

  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [tokenData,  setTokenData]  = useState(null);
  const [uploads,    setUploads]    = useState({}); // docType → { file, status, progress, msg }
  const fileRefs = useRef({});

  useEffect(() => {
    if (!token) { setError('No upload token provided.'); setLoading(false); return; }
    fetch(`/.netlify/functions/portUpload?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); }
        else {
          setTokenData(data);
          // Pre-fill existing uploads
          const existing = {};
          (data.existing || []).forEach(e => {
            existing[e.doc_type] = { status: 'done', msg: `✓ ${e.file_name} — uploaded ${new Date(e.uploaded_at).toLocaleDateString()}` };
          });
          setUploads(existing);
        }
        setLoading(false);
      })
      .catch(() => { setError('Unable to load upload page. Please try again.'); setLoading(false); });
  }, [token]);

  async function handleUpload(docType, file) {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setUploads(u => ({ ...u, [docType]: { status: 'error', msg: `File too large — maximum ${MAX_MB}MB` } }));
      return;
    }

    setUploads(u => ({ ...u, [docType]: { file, status: 'uploading', msg: 'Uploading...' } }));

    // Convert to base64
    const base64 = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = () => res(reader.result.split(',')[1]);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });

    try {
      const resp = await fetch('/.netlify/functions/portUpload', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          docType,
          fileName:    file.name,
          fileBase64:  base64,
          contentType: file.type,
        }),
      });
      const data = await resp.json();
      if (data.error) {
        setUploads(u => ({ ...u, [docType]: { status: 'error', msg: '✗ ' + data.error } }));
      } else {
        setUploads(u => ({ ...u, [docType]: { status: 'done', msg: `✓ ${file.name} uploaded successfully` } }));
        if (data.allComplete) {
          setTokenData(t => ({ ...t, allComplete: true }));
        }
      }
    } catch (e) {
      setUploads(u => ({ ...u, [docType]: { status: 'error', msg: '✗ Upload failed — please try again' } }));
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', color:'#6b7280', fontSize:13 }}>Loading secure upload portal…</div>
    </div>
  );

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) return (
    <div style={{ minHeight:'100vh', background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ maxWidth:480, textAlign:'center' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
        <div style={{ fontSize:16, fontWeight:700, color:'#0f1e3c', marginBottom:8 }}>Upload Link Issue</div>
        <div style={{ fontSize:13, color:'#6b7280', lineHeight:1.7 }}>{error}</div>
        <div style={{ marginTop:16, fontSize:12, color:'#9ca3af' }}>Contact your Ferrum representative if you believe this is an error.</div>
      </div>
    </div>
  );

  const doneTypes = Object.entries(uploads).filter(([, v]) => v.status === 'done').map(([k]) => k);
  const allDone   = tokenData?.docTypes?.every(t => doneTypes.includes(t));

  return (
    <div style={{ minHeight:'100vh', background:'#f0f4ff', fontFamily:'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background:'#0f1e3c', padding:'16px 24px', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:32, height:32, background:'#e53935', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ color:'white', fontWeight:900, fontSize:14 }}>F</span>
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:'white' }}>Ferrum Technology Services</div>
          <div style={{ fontSize:10, color:'#94a3b8' }}>Secure Document Upload Portal</div>
        </div>
      </div>

      <div style={{ maxWidth:640, margin:'0 auto', padding:'24px 16px' }}>

        {/* Quote context */}
        <div style={{ background:'white', borderRadius:8, padding:'14px 18px', marginBottom:20, border:'1px solid #e5e7eb' }}>
          <div style={{ fontSize:12, color:'#6b7280', marginBottom:4 }}>Upload request for</div>
          <div style={{ fontSize:18, fontWeight:700, color:'#0f1e3c' }}>{tokenData.clientName}</div>
          {tokenData.quoteNumber && (
            <div style={{ fontSize:11, color:'#9ca3af', fontFamily:'monospace', marginTop:2 }}>{tokenData.quoteNumber}</div>
          )}
          {tokenData.message && (
            <div style={{ marginTop:10, padding:'8px 12px', background:'#f8fafc', borderRadius:5, fontSize:12, color:'#374151', lineHeight:1.6, borderLeft:'3px solid #0f1e3c' }}>
              {tokenData.message}
            </div>
          )}
          <div style={{ marginTop:10, fontSize:11, color:'#9ca3af' }}>
            This upload link expires {new Date(tokenData.expiresAt).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })}.
          </div>
        </div>

        {/* All complete banner */}
        {allDone && (
          <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'14px 18px', marginBottom:20, textAlign:'center' }}>
            <div style={{ fontSize:24, marginBottom:6 }}>✅</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#166534', marginBottom:4 }}>All documents received!</div>
            <div style={{ fontSize:12, color:'#6b7280' }}>Your Ferrum representative has been notified and will proceed with the port request.</div>
          </div>
        )}

        {/* Required notice */}
        <div style={{ padding:'8px 12px', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:6, fontSize:11, color:'#9a3412', marginBottom:16, lineHeight:1.6 }}>
          <strong>Important:</strong> All three documents are required before we can submit your port request.
          The phone bill must be dated within the last 60 days. The information on all documents must exactly
          match your current carrier's records.
        </div>

        {/* Document upload cards */}
        {(tokenData.docTypes || []).map(docType => {
          const cfg      = DOC_CONFIG[docType] || DOC_CONFIG.other;
          const upload   = uploads[docType] || {};
          const isDone   = upload.status === 'done';
          const isError  = upload.status === 'error';
          const isUploading = upload.status === 'uploading';

          return (
            <div key={docType} style={{
              background:    isDone ? '#f0fdf4' : 'white',
              border:        `2px solid ${isDone ? '#bbf7d0' : isError ? '#fca5a5' : cfg.border}`,
              borderRadius:  8, padding:'16px', marginBottom:14,
            }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:10 }}>
                <div style={{ fontSize:24, flexShrink:0 }}>{cfg.icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color: isDone ? '#166534' : cfg.color, marginBottom:2 }}>
                    {cfg.label}
                    {isDone && <span style={{ fontSize:11, marginLeft:8, color:'#166534' }}>✓ Received</span>}
                  </div>
                  <div style={{ fontSize:11, color:'#6b7280', lineHeight:1.6 }}>{cfg.desc}</div>
                </div>
              </div>

              {upload.msg && (
                <div style={{ fontSize:11, fontWeight:600, marginBottom:8, padding:'5px 8px', borderRadius:4,
                  background: isDone ? '#dcfce7' : isError ? '#fee2e2' : '#eff6ff',
                  color:      isDone ? '#166534' : isError ? '#991b1b' : '#1e40af' }}>
                  {upload.msg}
                </div>
              )}

              <input
                ref={el => fileRefs.current[docType] = el}
                type="file" accept={ACCEPT} style={{ display:'none' }}
                onChange={e => handleUpload(docType, e.target.files[0])}
              />
              <button
                onClick={() => fileRefs.current[docType]?.click()}
                disabled={isUploading}
                style={{
                  padding:    '8px 16px',
                  background:  isDone ? 'white' : cfg.color,
                  color:       isDone ? cfg.color : 'white',
                  border:      `1px solid ${cfg.color}`,
                  borderRadius: 5, fontSize:12, fontWeight:600,
                  cursor:      isUploading ? 'not-allowed' : 'pointer',
                  opacity:     isUploading ? 0.6 : 1,
                  width:       '100%',
                }}>
                {isUploading ? 'Uploading…' : isDone ? '↻ Replace Document' : '↑ Select File to Upload'}
              </button>
              <div style={{ fontSize:9, color:'#9ca3af', marginTop:5, textAlign:'center' }}>
                PDF, Word, JPG, PNG — max {MAX_MB}MB
              </div>
            </div>
          );
        })}

        {/* Footer */}
        <div style={{ textAlign:'center', fontSize:11, color:'#9ca3af', marginTop:24, lineHeight:1.7 }}>
          This is a secure upload portal provided by Ferrum Technology Services, LLC.<br/>
          Files are encrypted and stored securely. Questions? Contact your representative directly.
        </div>
      </div>
    </div>
  );
}
