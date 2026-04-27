// portUpload.js — handles client uploads from the public portal
// Validates token, stores file in Supabase Storage, records in port_documents,
// notifies rep, optionally syncs to HubSpot

const { createClient } = require('@supabase/supabase-js');
const FormData         = require('form-data');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );

  // ── GET /portUpload?token=xxx — validate token + return metadata ──────────
  if (event.httpMethod === 'GET') {
    const token = event.queryStringParameters?.token;
    if (!token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Token required' }) };

    const { data: tok } = await supabase
      .from('portal_upload_tokens')
      .select('*, quotes(quote_number, client_name, status)')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!tok) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Upload link is invalid or has expired.' }) };

    // Get existing uploads for this quote
    const { data: existing } = await supabase
      .from('port_documents')
      .select('doc_type, file_name, uploaded_at, active')
      .eq('quote_id', tok.quote_id)
      .eq('active', true);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        quoteNumber:  tok.quote_number || tok.quotes?.quote_number,
        clientName:   tok.client_name  || tok.quotes?.client_name,
        docTypes:     tok.doc_types,
        message:      tok.message,
        expiresAt:    tok.expires_at,
        existing:     existing || [],
      }),
    };
  }

  // ── POST /portUpload — receive file upload ────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { token, docType, fileName, fileBase64, contentType, notes } = body;
    if (!token)      return { statusCode: 400, headers, body: JSON.stringify({ error: 'token required' }) };
    if (!docType)    return { statusCode: 400, headers, body: JSON.stringify({ error: 'docType required' }) };
    if (!fileBase64) return { statusCode: 400, headers, body: JSON.stringify({ error: 'fileBase64 required' }) };

    // Validate token
    const { data: tok } = await supabase
      .from('portal_upload_tokens')
      .select('*')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!tok) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid or expired upload link.' }) };

    // Validate docType is allowed for this token
    if (!tok.doc_types.includes(docType)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `Document type '${docType}' not requested for this upload.` }) };
    }

    // Decode base64 file
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const fileSizeBytes = fileBuffer.length;
    if (fileSizeBytes > 10 * 1024 * 1024) { // 10MB
      return { statusCode: 413, headers, body: JSON.stringify({ error: 'File too large — maximum 10MB.' }) };
    }

    // Upload to Supabase Storage
    const timestamp    = Date.now();
    const safeFileName = (fileName || 'document').replace(/[^a-z0-9._-]/gi, '_');
    const storagePath  = `${tok.quote_id}/${docType}_${timestamp}_${safeFileName}`;

    const { error: uploadErr } = await supabase.storage
      .from('port-documents')
      .upload(storagePath, fileBuffer, {
        contentType: contentType || 'application/pdf',
        upsert: false,
      });

    if (uploadErr) {
      console.error('Storage upload error:', uploadErr);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'File storage failed: ' + uploadErr.message }) };
    }

    // Mark any previous uploads of same type as inactive (replaced)
    await supabase.from('port_documents')
      .update({ active: false })
      .eq('quote_id', tok.quote_id)
      .eq('doc_type', docType)
      .eq('active', true);

    // Record in port_documents
    const { data: docRecord } = await supabase.from('port_documents').insert({
      quote_id:     tok.quote_id,
      doc_type:     docType,
      file_name:    safeFileName,
      storage_path: storagePath,
      file_size:    fileSizeBytes,
      content_type: contentType || 'application/pdf',
      uploaded_by:  `client:${tok.client_email || token.slice(0,8)}`,
      notes,
    }).select().single();

    // Mark token as used if first upload
    if (!tok.used_at) {
      await supabase.from('portal_upload_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', tok.id);
    }

    // Check if all requested doc types are now uploaded
    const { data: allDocs } = await supabase
      .from('port_documents')
      .select('doc_type')
      .eq('quote_id', tok.quote_id)
      .eq('active', true);

    const uploadedTypes = (allDocs || []).map(d => d.doc_type);
    const allComplete   = tok.doc_types.every(t => uploadedTypes.includes(t));
    if (allComplete) {
      await supabase.from('portal_upload_tokens')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', tok.id);
    }

    // Notify rep via email if SMTP is configured
    if (process.env.SMTP2GO_API_KEY) {
      const DOC_LABELS = { loa: 'Letter of Authorization', invoice: 'Phone Bill / Invoice', csr: 'Customer Service Record', other: 'Document' };
      await fetch('https://api.smtp2go.com/v3/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key:  process.env.SMTP2GO_API_KEY,
          to:       ['billing@ferrumit.com'],
          sender:   'Ferrum IQ Portal <noreply@ferrumit.email>',
          subject:  `📎 ${DOC_LABELS[docType] || docType} uploaded — ${tok.quote_number || tok.quote_id}`,
          html_body: `
            <p><strong>${tok.client_name || 'Client'}</strong> uploaded a <strong>${DOC_LABELS[docType]}</strong> for quote <strong>${tok.quote_number || ''}</strong>.</p>
            <p>File: ${safeFileName} (${(fileSizeBytes/1024).toFixed(0)} KB)</p>
            ${allComplete ? '<p style="color:green"><strong>✓ All required documents received — port request is ready to submit.</strong></p>' : `<p>Still waiting for: ${tok.doc_types.filter(t => !uploadedTypes.includes(t)).join(', ')}</p>`}
            <p><a href="https://lustrous-treacle-e0ca6a.netlify.app/voice/${tok.quote_id}">View quote →</a></p>
          `,
        }),
      }).catch(e => console.warn('Email notification failed:', e.message));
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success:     true,
        docId:       docRecord?.id,
        storagePath,
        allComplete,
        uploadedTypes,
      }),
    };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
