// Quote version snapshot helper
import { supabase } from './supabase';
import { computeDiff, buildSnapshot } from './quoteDiff';

export async function saveQuoteVersion({ quoteId, quoteData, inputs, totals, lineItems, profile }) {
  if (!quoteId) return;

  // Get the latest version number and previous snapshot
  const { data: existing } = await supabase
    .from('quote_versions')
    .select('version, snapshot')
    .eq('quote_id', quoteId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (existing?.version || 0) + 1;
  const snapshot    = buildSnapshot(quoteData, inputs, totals, lineItems);
  const { changes, summary } = computeDiff(existing?.snapshot || null, snapshot);

  // Always save v1; for subsequent saves, only save if something changed
  if (nextVersion > 1 && changes.length === 0) return;

  await supabase.from('quote_versions').insert({
    quote_id:       quoteId,
    version:        nextVersion,
    saved_by_id:    profile?.id,
    saved_by_name:  profile?.full_name || profile?.email?.split('@')[0],
    saved_by_email: profile?.email,
    snapshot,
    diff:           { changes, summary },
    change_summary: summary,
  });
}
