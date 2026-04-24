import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Activity logging helper ─────────────────────────────────────────────────
export async function logActivity({ action, entityType, entityId, entityName, changes, metadata }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('activity_log').insert({
    user_id:     user.id,
    user_email:  user.email,
    action,
    entity_type: entityType,
    entity_id:   entityId,
    entity_name: entityName,
    changes,
    metadata
  });
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
export async function getCurrentProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data;
}

export async function isAdmin() {
  const profile = await getCurrentProfile();
  return profile?.role === 'admin';
}
