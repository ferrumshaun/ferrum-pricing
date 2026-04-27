// SignWell webhook handler
// SignWell POSTs to this URL when documents are viewed/signed/completed
// Register this URL in SignWell dashboard: Settings → API → Webhooks
// URL: https://lustrous-treacle-e0ca6a.netlify.app/.netlify/functions/signwellWebhook

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
  );

  const { event: eventType, document } = payload;
  if (!document?.id) return { statusCode: 200, body: 'ok' };

  const signwellDocId = document.id;
  const status        = document.status; // 'pending', 'completed', 'declined'

  // Find the quote linked to this SignWell document
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, inputs')
    .filter('inputs->signwellDocuments', 'cs', JSON.stringify([{ id: signwellDocId }]));

  // Also try direct column match if we add a dedicated column later
  // For now we search in inputs JSONB

  for (const quote of quotes || []) {
    const docs = quote.inputs?.signwellDocuments || [];
    const docIndex = docs.findIndex(d => d.id === signwellDocId);
    if (docIndex === -1) continue;

    // Update the document status in the inputs JSONB
    const updatedDocs = [...docs];
    updatedDocs[docIndex] = {
      ...updatedDocs[docIndex],
      status,
      event: eventType,
      updatedAt: new Date().toISOString(),
      ...(status === 'completed' ? {
        completedAt: new Date().toISOString(),
        completedPdfUrl: document.completed_pdf_url || null,
      } : {}),
    };

    await supabase.from('quotes')
      .update({ inputs: { ...quote.inputs, signwellDocuments: updatedDocs } })
      .eq('id', quote.id);

    console.log(`SignWell webhook: ${eventType} for doc ${signwellDocId} → quote ${quote.id}`);
  }

  return { statusCode: 200, body: 'ok' };
};
